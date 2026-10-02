// Writes a scenario's history into a real log, so the orchestrator folds the packet the scenario describes instead of being
// handed one. Cards and charges here are SIMULATED and unknown to the rail; they exist to make the fold come out right.
import type { CardRecord } from "@laisee/core/generated";
import { appendEntry, signRevocation } from "@laisee/core/log";
import type { CardEvent, LogStore, Signer } from "@laisee/core/ports";
import { cardExpiryIso } from "../scenario/history";
import type { HistoryEvent, Scenario } from "../types";

/** Seconds after a history card's mint at which it is charged or voided. */
const SETTLE_AFTER_S = 30;
const HISTORY_MERCHANT = "demo-history.example";

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
    await appendEntry(w.store, w.engine, w.logId, "CARD_MINTED", card, at(event.agoS));
    if (event.kind === "active") continue;
    const settled = settlement(card, event.kind === "spent" ? "AUTHORISED" : "VOIDED", limit);
    await appendEntry(w.store, w.engine, w.logId, "CARD_EVENT", settled, at(event.agoS - SETTLE_AFTER_S));
  }
}
