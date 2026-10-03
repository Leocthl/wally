// Rebuilding the SIMULATED rail from the log. On-device mode keeps the rail in the page, so after a reload it knows no
// cards, although the log says which cards were minted, charged, voided or expired. Left alone, a card the log calls ACTIVE
// could not be charged, a used card would decline as an unknown handle instead of as used, a void or an expiry would find
// no card, and the rail's limit on active cards would start from zero. The rail is a stand-in for a service that would
// outlive the page, so it is rebuilt: the log's own CARD_MINTED and CARD_EVENT entries are played into a new RailSim
// through its public calls (mint, authorise, void, expireDue), in log order, with the stored card id, handle and last4
// played back through the rail's random source. After each step the rail's answer has to equal what the log recorded,
// and at the end every card has to equal its logged record in its logged state. Any difference refuses the restore.
// Declines are not played: they change nothing but the rail's retry memory, and the executor decides retries from the log.
import { jcs } from "@wally/core/crypto";
import type { CardRecord, Decision, LogEntry } from "@wally/core/generated";
import type { CardEvent, RailPort } from "@wally/core/ports";
import { RailSim, type RandomSource } from "@wally/rail-sim";

export class RailReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RailReplayError";
  }
}

/** The rail draws card id and handle characters from this alphabet, letters first (rail-sim ids.ts); digits only in the full pool. */
const POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CARD_PREFIX = "crd_";
const HANDLE_PREFIX = "hdl_";

type Draw = { readonly kind: "char"; readonly ch: string } | { readonly kind: "int"; readonly value: number };

/**
 * A random source that first plays back the draws that made one stored card, then falls back to the real source. The
 * rail asks nextInt(pool size) for each character of an id and nextInt(10000) for the last four digits; the pool size
 * tells which alphabet is in use (a digit run switches it to letters only), so the index of the stored character in the
 * full pool is the draw, and a character the rail could not have drawn refuses the replay.
 */
export class PlaybackRandom implements RandomSource {
  readonly #fallback: RandomSource;
  #draws: readonly Draw[] = [];

  constructor(fallback: RandomSource) {
    this.#fallback = fallback;
  }

  /** The draws the rail will make for this card: the id, the handle, then the last four digits. */
  queue(card: Pick<CardRecord, "id" | "handle" | "last4">): void {
    if (!card.id.startsWith(CARD_PREFIX) || !card.handle.startsWith(HANDLE_PREFIX)) throw new RailReplayError(`card ${card.id} has an id or handle the rail does not make`);
    const chars = [...card.id.slice(CARD_PREFIX.length), ...card.handle.slice(HANDLE_PREFIX.length)];
    this.#draws = [...chars.map((ch): Draw => ({ kind: "char", ch })), { kind: "int", value: Number(card.last4) }];
  }

  /** Draws still waiting; 0 after a card has been made exactly as stored. */
  get queued(): number {
    return this.#draws.length;
  }

  nextInt(maxExclusive: number): number {
    const [next, ...rest] = this.#draws;
    if (next === undefined) return this.#fallback.nextInt(maxExclusive);
    this.#draws = rest;
    const value = next.kind === "int" ? next.value : POOL.indexOf(next.ch);
    if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) throw new RailReplayError("a stored card id cannot be made by the rail's id source");
    return value;
  }
}

const same = (a: unknown, b: unknown): boolean => jcs(a) === jcs(b);

async function mintAgain(rail: RailSim, random: PlaybackRandom, decisions: ReadonlyMap<string, Decision>, card: CardRecord): Promise<void> {
  const decision = decisions.get(card.decision_id);
  if (decision === undefined) throw new RailReplayError(`card ${card.id} was minted for a decision that is not in the log`);
  random.queue(card);
  const minted = await rail.mint({
    decision,
    ttlMs: Date.parse(card.expires_at) - Date.parse(card.minted_at),
    now: new Date(card.minted_at),
    ...(card.merchant_lock === undefined ? {} : { merchantLock: card.merchant_lock }),
    ...(card.purpose === undefined ? {} : { purpose: card.purpose }),
  });
  if (random.queued !== 0) throw new RailReplayError(`card ${card.id}: the rail drew fewer values than the stored card needs`);
  if (!same(minted, card)) throw new RailReplayError(`card ${card.id}: the rebuilt card differs from the logged card`);
}

async function chargeAgain(rail: RailSim, card: CardRecord, event: CardEvent): Promise<CardEvent> {
  const { amount_minor: amountMinor, merchant_domain: merchantDomain, idempotency_key: idempotencyKey } = event;
  if (amountMinor === undefined || merchantDomain === undefined || idempotencyKey === undefined) {
    throw new RailReplayError(`card ${card.id}: the logged charge lacks its amount, merchant or key`);
  }
  return rail.authorise({ handle: card.handle, amountMinor, merchantDomain, now: new Date(event.at), idempotencyKey });
}

async function expireAgain(rail: RailSim, card: CardRecord, event: CardEvent): Promise<void> {
  const state = rail.card(card.id)?.state;
  if (state === "EXPIRED") return; // expired together with another card by an earlier call: the rail expires every due card at once
  if (state !== "ACTIVE") throw new RailReplayError(`card ${card.id}: logged as expired while the rebuilt card is ${state ?? "missing"}`);
  const events = await rail.expireDue(new Date(event.at));
  if (!events.some((e) => same(e, event))) throw new RailReplayError(`card ${card.id}: the rebuilt rail did not expire it at ${event.at}`);
}

async function eventAgain(rail: RailSim, cards: ReadonlyMap<string, CardRecord>, event: CardEvent): Promise<void> {
  const card = cards.get(event.card_id);
  if (card === undefined) {
    if (event.event === "DECLINED") return; // an unknown handle was presented: no card of this log
    throw new RailReplayError(`card ${event.card_id} is not in the log`);
  }
  switch (event.event) {
    case "AUTHORISED": {
      if (!same(await chargeAgain(rail, card, event), event)) throw new RailReplayError(`card ${card.id}: the rebuilt rail did not charge as logged`);
      return;
    }
    case "VOIDED": {
      if (!same(await rail.void(card.id, new Date(event.at)), event)) throw new RailReplayError(`card ${card.id}: the rebuilt rail did not void as logged`);
      return;
    }
    case "EXPIRED":
      return expireAgain(rail, card, event);
    default:
      return; // DECLINED: nothing to rebuild
  }
}

const NEXT_STATE: Readonly<Record<string, CardRecord["state"] | undefined>> = { AUTHORISED: "USED", VOIDED: "VOIDED", EXPIRED: "EXPIRED" };

/** The state a card ends in, folded from its events (it only ever leaves ACTIVE once). */
function loggedState(card: CardRecord, entries: readonly LogEntry[]): CardRecord["state"] {
  return entries.reduce<CardRecord["state"]>((state, e) => {
    if (e.kind !== "CARD_EVENT" || e.payload.card_id !== card.id || state !== "ACTIVE") return state;
    return NEXT_STATE[e.payload.event] ?? state;
  }, "ACTIVE");
}

function assertSameCards(rail: RailSim, minted: readonly CardRecord[], entries: readonly LogEntry[]): void {
  if (rail.cards.length !== minted.length) throw new RailReplayError(`the rebuilt rail holds ${rail.cards.length} cards, the log minted ${minted.length}`);
  for (const card of minted) {
    const live = rail.card(card.id);
    if (live === undefined || !same(live, { ...card, state: loggedState(card, entries) })) {
      throw new RailReplayError(`card ${card.id}: the rebuilt rail differs from the log`);
    }
  }
}

/**
 * Plays the log's cards into `rail`, a new RailSim whose random source is `random`. Resolves when the rail equals the log;
 * rejects with RailReplayError on any difference (the caller then does not restore).
 */
export async function replayRail(rail: RailPort, random: PlaybackRandom, entries: readonly LogEntry[]): Promise<void> {
  if (!(rail instanceof RailSim)) throw new RailReplayError("the rail cannot be rebuilt: it is not the SIMULATED rail");
  const decisions = new Map<string, Decision>();
  const cards = new Map<string, CardRecord>();
  for (const entry of entries) {
    if (entry.kind === "DECISION") decisions.set(entry.payload.id, entry.payload);
    else if (entry.kind === "CARD_MINTED") {
      await mintAgain(rail, random, decisions, entry.payload);
      cards.set(entry.payload.id, entry.payload);
    } else if (entry.kind === "CARD_EVENT") await eventAgain(rail, cards, entry.payload);
  }
  assertSameCards(rail, [...cards.values()], entries);
}
