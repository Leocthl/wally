// Immutable rail state. Every change returns a new RailState (copy on write); the rail swaps its reference.
// Cards are small and few (F1 allows 2 active), so copying maps is cheaper than any shared-mutation bug.
import type { CardRecord } from "@laisee/core/generated";
import type { CardEvent } from "@laisee/core/ports";

export interface KeyRecord {
  /** requestPrint of the first request that used the key. */
  readonly print: string;
  readonly event: CardEvent;
}

export interface RailState {
  readonly cards: ReadonlyMap<string, CardRecord>;
  readonly byDecision: ReadonlyMap<string, string>;
  readonly byHandle: ReadonlyMap<string, string>;
  readonly byKey: ReadonlyMap<string, KeyRecord>;
  /** Amount settled per USED card. */
  readonly settled: ReadonlyMap<string, number>;
  readonly authorisations: readonly CardEvent[];
}

export const EMPTY_STATE: RailState = Object.freeze({
  cards: new Map(),
  byDecision: new Map(),
  byHandle: new Map(),
  byKey: new Map(),
  settled: new Map(),
  authorisations: Object.freeze([]),
});

/** Money view of one card: what is held, settled and released. settled + held + released == limit, always. */
export interface CardLedger {
  readonly card_id: string;
  readonly state: CardRecord["state"];
  readonly limit_minor: number;
  readonly settled_minor: number;
  readonly held_minor: number;
  readonly released_minor: number;
  readonly simulated: true;
}

function put<K, V>(map: ReadonlyMap<K, V>, key: K, value: V): ReadonlyMap<K, V> {
  return new Map([...map, [key, value]]);
}

export function addCard(state: RailState, card: CardRecord): RailState {
  return {
    ...state,
    cards: put(state.cards, card.id, card),
    byDecision: put(state.byDecision, card.decision_id, card.id),
    byHandle: put(state.byHandle, card.handle, card.id),
  };
}

export function setCardState(state: RailState, cardId: string, next: CardRecord["state"]): RailState {
  const card = state.cards.get(cardId);
  if (card === undefined) return state;
  return { ...state, cards: put(state.cards, cardId, Object.freeze({ ...card, state: next })) };
}

export function recordKey(state: RailState, key: string, record: KeyRecord): RailState {
  return { ...state, byKey: put(state.byKey, key, record) };
}

/** A successful charge: the card becomes USED, the amount is settled, the event is kept for the idempotency key. */
export function recordCharge(state: RailState, cardId: string, key: string, record: KeyRecord): RailState {
  const used = setCardState(state, cardId, "USED");
  return {
    ...recordKey(used, key, record),
    settled: put(used.settled, cardId, record.event.amount_minor ?? 0),
    authorisations: Object.freeze([...used.authorisations, record.event]),
  };
}

export function activeCount(state: RailState): number {
  return [...state.cards.values()].filter((c) => c.state === "ACTIVE").length;
}

export function ledgerOf(state: RailState, cardId: string): CardLedger | undefined {
  const card = state.cards.get(cardId);
  if (card === undefined) return undefined;
  const settled = state.settled.get(cardId) ?? 0;
  const held = card.state === "ACTIVE" ? card.limit_minor : 0;
  return Object.freeze({
    card_id: card.id,
    state: card.state,
    limit_minor: card.limit_minor,
    settled_minor: settled,
    held_minor: held,
    released_minor: card.limit_minor - settled - held,
    simulated: true,
  });
}
