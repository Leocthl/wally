// Pure views of the booth state for the Budget screen. A new seal starts a new log and a new set of cards on the
// engine side, while the reducer keeps what it saw before; these selectors read only the current budget's records.
import type { CardRecord, Decision, EscalationView, LogEntry } from "../../api/types";
import type { BoothState } from "../../state/booth";

export type DecisionOutcome = Decision["outcome"];

export interface DecisionRow {
  readonly id: string;
  readonly seq: number;
  readonly outcome: DecisionOutcome;
  readonly title: string;
  readonly merchant: string;
  readonly totalMinor: number;
  readonly at: string;
}

/** The log of the budget in force: the packet names it; before any packet, the newest entry does. */
export function currentEntries(state: BoothState): readonly LogEntry[] {
  const logId = state.packet?.log_id ?? state.log.entries.at(-1)?.log_id;
  return logId === undefined ? [] : state.log.entries.filter((e) => e.log_id === logId);
}

function decisionOf(entry: LogEntry): Decision | null {
  if (entry.kind !== "DECISION") return null;
  const payload = entry.payload as Partial<Decision>;
  return typeof payload.id === "string" && payload.cart !== undefined && typeof payload.outcome === "string" ? (payload as Decision) : null;
}

function rowOf(entry: LogEntry, d: Decision): DecisionRow {
  return {
    id: d.id,
    seq: entry.seq,
    outcome: d.outcome,
    title: d.cart.items[0]?.title ?? d.cart.merchant.name,
    merchant: d.cart.merchant.name,
    totalMinor: d.cart.total_minor,
    at: d.decided_at,
  };
}

/** Newest first. A decision closed by a later one (an answered or expired escalation, a voided approval) shows once,
 *  as its final state, so a purchase is one row. */
export function recentDecisions(state: BoothState, limit = 3): readonly DecisionRow[] {
  const decided = currentEntries(state).flatMap((e) => {
    const d = decisionOf(e);
    return d ? [{ entry: e, decision: d }] : [];
  });
  const closed = new Set(decided.flatMap(({ decision }) => (decision.resolves ? [decision.resolves] : [])));
  return decided
    .filter(({ decision }) => !closed.has(decision.id))
    .map(({ entry, decision }) => rowOf(entry, decision))
    .sort((a, b) => b.seq - a.seq)
    .slice(0, limit);
}

export interface CardGroups {
  readonly active: readonly CardRecord[];
  readonly past: readonly CardRecord[];
}

/** Cards of the budget in force, newest first: ready ones on top, used, cancelled and expired ones after. */
export function cardGroups(state: BoothState): CardGroups {
  const mandateId = state.mandate?.id;
  const mine = state.cards.filter((c) => mandateId === undefined || c.mandate_id === mandateId);
  const newest = [...mine].sort((a, b) => Date.parse(b.minted_at) - Date.parse(a.minted_at));
  return { active: newest.filter((c) => c.state === "ACTIVE"), past: newest.filter((c) => c.state !== "ACTIVE") };
}

/** Escalations still waiting for an answer in the budget in force, the oldest (first to expire) first. */
export function openEscalations(state: BoothState): readonly EscalationView[] {
  const ids = new Set(currentEntries(state).flatMap((e) => (e.kind === "DECISION" ? [String((e.payload as { id?: unknown }).id)] : [])));
  return state.escalations
    .filter((e) => e.state === "OPEN" && (ids.size === 0 || ids.has(e.decisionId)))
    .slice()
    .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
}

/** The title of the item behind a decision, for the escalation banner. */
export function decisionTitle(state: BoothState, decisionId: string): string | null {
  for (const e of currentEntries(state)) {
    const d = decisionOf(e);
    if (d?.id === decisionId) return d.cart.items[0]?.title ?? d.cart.merchant.name;
  }
  return null;
}
