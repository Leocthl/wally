// Reducers for foldPacket: one log entry in, a new FoldState out (never mutated). Integer cents, no clock.
// Accounting (audit H4, S-RAIL-2): an APPROVE holds its approved limit from the moment it is logged until its card is
// logged (CARD_MINTED for that decision id: the hold becomes the card's commitment) or a later decision resolves it,
// so two approvals can never both spend the same remaining budget. AUTHORISED settles the charged amount and releases
// the rest of the limit; VOIDED and EXPIRED release the limit; DECLINED holds it.
import type { CardRecord, Decision } from "../generated";
import type { CardEvent } from "../ports";

export type CardState = CardRecord["state"];

export interface TrackedCard {
  readonly limit: number;
  readonly expiresAt: string;
  readonly state: CardState;
}

export interface FoldState {
  readonly cards: ReadonlyMap<string, TrackedCard>;
  /** Limits of ACTIVE cards. Holds of unminted approvals are kept apart in `holds`. */
  readonly committed: number;
  readonly spent: number;
  readonly mintTimes: readonly string[];
  readonly open: ReadonlyMap<string, string>;
  readonly settled: ReadonlySet<string>;
  /** APPROVE decision id -> approved limit, while no card is logged for it and nothing resolved it. */
  readonly holds: ReadonlyMap<string, number>;
  /** Decision ids that have a CARD_MINTED or a resolving decision: they never hold again. */
  readonly closed: ReadonlySet<string>;
  readonly revoked: boolean;
  readonly expired: boolean;
}

export const EMPTY: FoldState = {
  cards: new Map(),
  committed: 0,
  spent: 0,
  mintTimes: [],
  open: new Map(),
  settled: new Set(),
  holds: new Map(),
  closed: new Set(),
  revoked: false,
  expired: false,
};

export const isMoney = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

const put = <V>(map: ReadonlyMap<string, V>, key: string, value: V): ReadonlyMap<string, V> => new Map([...map, [key, value]]);
const drop = <V>(map: ReadonlyMap<string, V>, key: string | undefined): ReadonlyMap<string, V> =>
  key === undefined || !map.has(key) ? map : new Map([...map].filter(([k]) => k !== key));

/** Ends the hold of `decisionId` for good (its card is logged, or a later decision resolved it). */
function close(s: FoldState, decisionId: string | undefined): FoldState {
  if (decisionId === undefined) return s;
  return { ...s, holds: drop(s.holds, decisionId), closed: new Set([...s.closed, decisionId]) };
}

/**
 * The card's own state decides what it costs: ACTIVE commits its limit; USED is settled at its whole limit (the rail
 * never charges above it, and a USED card never releases anything); VOIDED or EXPIRED cost nothing.
 */
export function applyMinted(s: FoldState, card: CardRecord): FoldState {
  if (s.cards.has(card.id)) return s; // the same card logged twice commits once
  const base = close(s, card.decision_id);
  const tracked: TrackedCard = { limit: card.limit_minor, expiresAt: card.expires_at, state: card.state };
  const cards = put(base.cards, card.id, tracked);
  const mintTimes = [...base.mintTimes, card.minted_at];
  if (card.state === "ACTIVE") return { ...base, cards, mintTimes, committed: base.committed + card.limit_minor };
  if (card.state === "USED") return { ...base, cards, mintTimes, spent: base.spent + card.limit_minor };
  return { ...base, cards, mintTimes };
}

function settleKey(ev: CardEvent): string {
  return `${ev.card_id}|${ev.idempotency_key ?? `${ev.at}|${String(ev.amount_minor)}`}`;
}

function applyAuthorised(s: FoldState, ev: CardEvent): FoldState {
  const key = settleKey(ev);
  if (s.settled.has(key)) return s; // a retry with the same idempotency key charged once
  const card = s.cards.get(ev.card_id);
  const amount = isMoney(ev.amount_minor) ? ev.amount_minor : (card?.limit ?? 0);
  const settled = new Set([...s.settled, key]);
  if (card?.state !== "ACTIVE") return { ...s, settled, spent: s.spent + amount }; // anomaly: count it (conservative)
  const cards = put<TrackedCard>(s.cards, ev.card_id, { ...card, state: "USED" });
  return { ...s, cards, settled, committed: s.committed - card.limit, spent: s.spent + amount };
}

function applyRelease(s: FoldState, ev: CardEvent, state: "VOIDED" | "EXPIRED"): FoldState {
  const card = s.cards.get(ev.card_id);
  if (card?.state !== "ACTIVE") return s; // a USED card is settled: nothing to release [F2]
  return { ...s, cards: put<TrackedCard>(s.cards, ev.card_id, { ...card, state }), committed: s.committed - card.limit };
}

export function applyCardEvent(s: FoldState, ev: CardEvent): FoldState {
  switch (ev.event) {
    case "AUTHORISED":
      return applyAuthorised(s, ev);
    case "VOIDED":
    case "EXPIRED":
      return applyRelease(s, ev, ev.event);
    default:
      return s; // DECLINED: limit held
  }
}

/** The limit an APPROVE holds: approved_limit_minor (I2: equal to the cart total), or the cart total if it is missing. */
function heldLimit(d: Decision): number {
  const limit = d.approved_limit_minor ?? d.cart.total_minor;
  return isMoney(limit) ? limit : 0;
}

export function applyDecision(s: FoldState, d: Decision): FoldState {
  const resolved = close(s, d.resolves);
  const opened: [string, string][] = d.outcome === "ESCALATE" && d.escalation !== undefined ? [[d.id, d.escalation.expires_at]] : [];
  const open = new Map([...drop(resolved.open, d.resolves), ...opened]);
  const holds = d.outcome === "APPROVE" && !resolved.closed.has(d.id) ? put(resolved.holds, d.id, heldLimit(d)) : resolved.holds;
  return { ...resolved, open, holds };
}
