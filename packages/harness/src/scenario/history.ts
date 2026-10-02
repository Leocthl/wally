// History: the past events that make a scenario's packet what the scenario needs, and the packet they fold to. The fold
// here covers the four event kinds the generator uses and follows core's foldPacket (commit on mint, release on void,
// spent on a charge, mint times for every mint); worlds/history-log.ts writes the same events into a real log, and a test
// folds that log with core's foldPacket and compares. Times are SIMULATED scenario-clock choices, not product thresholds.
import type { Mandate, PacketState } from "@laisee/core/generated";
import { logIdForMandate } from "@laisee/core/log";
import { RAIL } from "../config";
import type { HistoryEvent } from "../types";

/** When the mandate was sealed, before the decision. Every history event falls after it. */
export const SEAL_AGO_S = 55 * 60;
/** When the card that carries the money already spent was minted. */
const SPENT_AGO_S = 50 * 60;
/** When ACTIVE cards were minted: outside the rolling window, so they add to the active count and not to R7. */
const ACTIVE_AGO_S = 15 * 60;
/** What a card voided inside the window held; it holds nothing once voided. */
const RELEASED_LIMIT_MINOR = 1_000;
/** A revocation, before the decision. */
const REVOKED_AGO_S = 5 * 60;

export interface HistorySpec {
  readonly tag: string;
  readonly budgetMinor: number;
  readonly remainingMinor: number;
  readonly activeCardLimits: readonly number[];
  readonly mintAgesS: readonly number[];
  readonly revoked: boolean;
}

/** Oldest first, which is the order the log gets them in. Throws when the numbers cannot come from any history. */
export function historyOf(spec: HistorySpec): readonly HistoryEvent[] {
  const committed = spec.activeCardLimits.reduce((acc, limit) => acc + limit, 0);
  const spent = spec.budgetMinor - committed - spec.remainingMinor;
  if (spent < 0) throw new RangeError(`remaining ${spec.remainingMinor} and active cards ${committed} exceed the budget ${spec.budgetMinor}`);
  const events: readonly HistoryEvent[] = [
    ...(spent > 0 ? [{ kind: "spent" as const, cardId: `crd_${spec.tag}s0`, agoS: SPENT_AGO_S, amountMinor: spent }] : []),
    ...spec.mintAgesS.map((agoS, k) => ({ kind: "released" as const, cardId: `crd_${spec.tag}r${k}`, agoS, limitMinor: RELEASED_LIMIT_MINOR })),
    ...spec.activeCardLimits.map((limitMinor, k) => ({ kind: "active" as const, cardId: `crd_${spec.tag}a${k}`, agoS: ACTIVE_AGO_S + 60 * k, limitMinor })),
    ...(spec.revoked ? [{ kind: "revoked" as const, agoS: REVOKED_AGO_S }] : []),
  ];
  return [...events].sort((a, b) => b.agoS - a.agoS);
}

/** Log entries one event writes: a mint and its charge or void are two, an ACTIVE card and a revocation are one. */
const entriesOf = (event: HistoryEvent): number => (event.kind === "spent" || event.kind === "released" ? 2 : 1);

/** When a card minted `agoS` before the decision expires: the card TTL after the mint [F30]. */
export const cardExpiryIso = (nowMs: number, agoS: number): string => new Date(nowMs - agoS * 1000 + RAIL.cardTtlMs).toISOString();

const isoAgo = (nowMs: number, agoS: number): string => new Date(nowMs - agoS * 1000).toISOString();

/** The packet that folding the log gives: the sealed credential, then these events, read at `nowMs`. */
export function packetFromHistory(mandate: Mandate, history: readonly HistoryEvent[], nowMs: number): PacketState {
  const active = history.flatMap((e) => (e.kind === "active" ? [e] : []));
  const committed = active.reduce((acc, e) => acc + e.limitMinor, 0);
  const spent = history.reduce((acc, e) => acc + (e.kind === "spent" ? e.amountMinor : 0), 0);
  const budget = mandate.rules.budget.amount_minor;
  const remaining = Math.max(0, budget - committed - spent);
  const revoked = history.some((e) => e.kind === "revoked");
  const status: PacketState["status"] = revoked ? "REVOKED" : nowMs >= Date.parse(mandate.valid_until) ? "EXPIRED" : remaining === 0 ? "EXHAUSTED" : "ACTIVE";
  const mintTimes = history.flatMap((e) => (e.kind === "revoked" ? [] : [isoAgo(nowMs, e.agoS)])).sort((a, b) => Date.parse(a) - Date.parse(b));
  return {
    mandate_id: mandate.id,
    log_id: logIdForMandate(mandate.id),
    budget_minor: budget,
    committed_minor: committed,
    spent_minor: spent,
    remaining_minor: remaining,
    currency: mandate.rules.budget.currency,
    active_cards: active.map((e) => ({ id: e.cardId, limit_minor: e.limitMinor, expires_at: cardExpiryIso(nowMs, e.agoS) })),
    mint_times: mintTimes,
    open_escalations: [],
    status,
    expires_at: mandate.valid_until,
    folded_through_seq: history.reduce((acc, e) => acc + entriesOf(e), 0),
    computed_at: new Date(nowMs).toISOString(),
  };
}
