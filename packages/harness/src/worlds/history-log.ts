// Writes a scenario's history into a real log, so the orchestrator folds the packet the scenario describes instead of being
// handed one. Cards, charges and the approvals behind them are SIMULATED and unknown to the rail; they exist to make the
// fold come out right. Each card follows an APPROVE for it, as in a real log: the orchestrator verifies the log before it
// reads it, and the verifier refuses a mint no earlier APPROVE stands behind (I1).
import type { CardRecord, Decision, JudgeRecord } from "@wally/core/generated";
import { appendEntry, signRevocation } from "@wally/core/log";
import { foldPacket } from "@wally/core/packet";
import type { CardEvent, LogStore, Signer } from "@wally/core/ports";
import { loadFixture } from "@wally/core/testing/fixtures";
import { cardExpiryIso } from "../scenario/history";
import type { HistoryEvent, Scenario } from "../types";

/** Seconds after a history card's mint at which it is charged or voided. */
const SETTLE_AFTER_S = 30;
/** Seconds the APPROVE comes before its mint. */
const APPROVE_BEFORE_MINT_S = 1;
const HISTORY_MERCHANT = "demo-history.example";
type RuleResult = Decision["rules"][number];
const skipped = (id: RuleResult["id"]): RuleResult => ({ id, result: "SKIPPED", inputs: { history: "SIMULATED" } });
const HISTORY_RULES: Decision["rules"] = [skipped("R1"), ...(["R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11", "R12"] as const).map(skipped)];
const HISTORY_JUDGE: JudgeRecord = loadFixture("judge/apparel-tee.json", "judge-record");
const HISTORY_ENGINE: Decision["engine"] = { version: "history (SIMULATED)", config_sha256: "0".repeat(64) };

const suffixOf = (cardId: string): string => cardId.slice("crd_".length);

function cardOf(scenario: Scenario, event: Exclude<HistoryEvent, { kind: "revoked" }>, limitMinor: number): CardRecord {
  const nowMs = Date.parse(scenario.now);
  const suffix = suffixOf(event.cardId);
  return {
    id: event.cardId,
    decision_id: `dec_${suffix}`,
    mandate_id: scenario.mandate.id,
    handle: `hdl_history_${suffix}_xxxx`,
    last4: "0000",
    limit_minor: limitMinor,
    currency: "HKD",
    minted_at: new Date(nowMs - event.agoS * 1000).toISOString(),
    expires_at: cardExpiryIso(nowMs, event.agoS),
    state: "ACTIVE",
    simulated: true,
  };
}

/** The APPROVE behind one history card: its limit is the cart total (I2); the rules were not run, so none is claimed. */
function approvalOf(scenario: Scenario, card: CardRecord, packet: Decision["packet"], decidedAt: Date): Decision {
  const suffix = suffixOf(card.id);
  const item = scenario.cart.items[0];
  if (item === undefined) throw new Error(`scenario ${scenario.id} has a cart with no item`);
  return {
    id: card.decision_id,
    mandate_id: card.mandate_id,
    cart: {
      ...scenario.cart,
      id: `crt_${suffix}`,
      proposed_at: new Date(decidedAt.getTime() - APPROVE_BEFORE_MINT_S * 1000).toISOString(),
      items: [{ ...item, qty: 1, unit_price_minor: card.limit_minor }],
      subtotal_minor: card.limit_minor,
      shipping_minor: 0,
      fees_minor: 0,
      fx: null,
      total_minor: card.limit_minor,
    },
    decided_at: decidedAt.toISOString(),
    outcome: "APPROVE",
    approved_limit_minor: card.limit_minor,
    packet,
    rules: HISTORY_RULES,
    judge: HISTORY_JUDGE,
    engine: HISTORY_ENGINE,
  };
}

function settlement(card: CardRecord, kind: "AUTHORISED" | "VOIDED", amountMinor: number): CardEvent {
  const at = new Date(Date.parse(card.minted_at) + SETTLE_AFTER_S * 1000).toISOString();
  return kind === "AUTHORISED"
    ? { card_id: card.id, event: "AUTHORISED", at, amount_minor: amountMinor, merchant_domain: HISTORY_MERCHANT, idempotency_key: `history-${suffixOf(card.id)}`, simulated: true }
    : { card_id: card.id, event: "VOIDED", at, simulated: true };
}

export interface HistoryWriter {
  readonly store: LogStore;
  readonly engine: Signer;
  readonly delegator: Signer;
  readonly logId: string;
}

/** Appends the events oldest first, each with its own past time. Throws when the log refuses an entry. */
export async function writeHistory(w: HistoryWriter, scenario: Scenario): Promise<void> {
  const nowMs = Date.parse(scenario.now);
  const at = (agoS: number): Date => new Date(nowMs - agoS * 1000);
  for (const event of scenario.history) {
    if (event.kind === "revoked") {
      const revocation = signRevocation({ mandate_id: scenario.mandate.id, revoked_at: at(event.agoS), reason: "history (SIMULATED)" }, w.delegator);
      await appendEntry(w.store, w.engine, w.logId, "MANDATE_REVOKED", revocation, at(event.agoS));
      continue;
    }
    const limit = event.kind === "spent" ? event.amountMinor : event.limitMinor;
    const card = cardOf(scenario, event, limit);
    const decidedAt = at(event.agoS + APPROVE_BEFORE_MINT_S);
    const packet = foldPacket(await w.store.read(w.logId), decidedAt);
    await appendEntry(w.store, w.engine, w.logId, "DECISION", approvalOf(scenario, card, packet, decidedAt), decidedAt);
    await appendEntry(w.store, w.engine, w.logId, "CARD_MINTED", card, at(event.agoS));
    if (event.kind === "active") continue;
    const settled = settlement(card, event.kind === "spent" ? "AUTHORISED" : "VOIDED", limit);
    await appendEntry(w.store, w.engine, w.logId, "CARD_EVENT", settled, at(event.agoS - SETTLE_AFTER_S));
  }
}
