// RailSim: the SIMULATED rail. Single-use card semantics [F1] behind RailPort. No real card exists here:
// a card is an opaque handle plus a random last4, every record and event says simulated (I8).
import type { CardRecord, Decision } from "@laisee/core/generated";
import { MintError, type AuthoriseRequest, type CardEvent, type MintRequest, type RailPort } from "@laisee/core/ports";
import { formatIssues, validateCardEvent, validateCardRecord } from "@laisee/core/schema";
import { authorisedEvent, declinedEvent, evaluateAuthorise, lifecycleEvent, requestPrint } from "./authorise-rules";
import { ID_COLLISION_RETRIES, RAIL_SIM_DEFAULTS, UNKNOWN_CARD_ID } from "./config";
import { DEFAULT_DECLINE_TABLE, describeDecline, type DeclineCode, type DeclineInfo, type DeclineTable } from "./decline-table";
import { RailSimError } from "./errors";
import { cryptoRandom, createIdSource, type IdSource, type RandomSource } from "./ids";
import { approvedLimit, assertCeiling, assertSlotFree, cardExpiry, type MintLimits } from "./mint-rules";
import {
  EMPTY_STATE,
  activeCount,
  addCard,
  ledgerOf,
  recordCharge,
  recordKey,
  setCardState,
  type CardLedger,
  type RailState,
} from "./rail-state";

export type { CardLedger } from "./rail-state";

export interface RailSimOptions {
  /** Per-card ceiling in minor units. Default [F1.ceiling]. */
  readonly ceilingMinor?: number;
  /** Max ACTIVE cards. Default [F1.active]. */
  readonly maxActive?: number;
  /** Longest TTL a mint may ask for, ms. Default [F30]. */
  readonly maxTtlMs?: number;
  /** Validity limit in calendar months. Default [F1.validity]. */
  readonly validityMonths?: number;
  /** Decline wording and timing. Default: the SIMULATED table; load a calibrated one with loadDeclineTableFile. */
  readonly declineTable?: DeclineTable;
  /** Randomness for last4 and the default ids. Default: Web Crypto. Inject seededRandom in tests. */
  readonly random?: RandomSource;
  /** Card id and handle source. Default: derived from `random`. */
  readonly ids?: IdSource;
  /** Waits out a deferred decline's delay_ms. Absent: deferred declines return at once. */
  readonly sleep?: (ms: number) => Promise<void>;
}

function positiveInt(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RailSimError("INVALID_CONFIG", `${name} must be a positive integer, got ${String(value)}`);
  return value;
}

function assertDate(value: unknown, name: string): asserts value is Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new RailSimError("INVALID_REQUEST", `${name} must be a valid Date`);
}

function assertValidEvent(event: CardEvent): void {
  const checked = validateCardEvent(event);
  if (!checked.ok) throw new RailSimError("INVALID_REQUEST", `request would not produce a valid event: ${formatIssues(checked.errors)}`);
}

export class RailSim implements RailPort {
  readonly #limits: MintLimits;
  readonly #table: DeclineTable;
  readonly #random: RandomSource;
  readonly #ids: IdSource;
  readonly #sleep: ((ms: number) => Promise<void>) | undefined;
  #state: RailState = EMPTY_STATE;

  constructor(options: RailSimOptions = {}) {
    this.#limits = Object.freeze({
      ceilingMinor: positiveInt(options.ceilingMinor ?? RAIL_SIM_DEFAULTS.ceilingMinor, "ceilingMinor"),
      maxActive: positiveInt(options.maxActive ?? RAIL_SIM_DEFAULTS.maxActive, "maxActive"),
      maxTtlMs: positiveInt(options.maxTtlMs ?? RAIL_SIM_DEFAULTS.maxTtlMs, "maxTtlMs"),
      validityMonths: positiveInt(options.validityMonths ?? RAIL_SIM_DEFAULTS.validityMonths, "validityMonths"),
    });
    this.#table = options.declineTable ?? DEFAULT_DECLINE_TABLE;
    this.#random = options.random ?? cryptoRandom();
    this.#ids = options.ids ?? createIdSource(this.#random);
    this.#sleep = options.sleep;
  }

  /** The limits in force (F1, F30 unless overridden). */
  get limits(): MintLimits {
    return this.#limits;
  }

  /** Current card records, oldest mint first. Frozen. */
  get cards(): readonly CardRecord[] {
    return Object.freeze([...this.#state.cards.values()]);
  }

  card(cardId: string): CardRecord | undefined {
    return this.#state.cards.get(cardId);
  }

  ledger(cardId: string): CardLedger | undefined {
    return ledgerOf(this.#state, cardId);
  }

  /** Every AUTHORISED event, oldest first: one entry per charge that landed. */
  authorisations(): readonly CardEvent[] {
    return this.#state.authorisations;
  }

  /** Wording, timing and provenance the decline table gives this code. */
  declineInfo(code: DeclineCode): DeclineInfo {
    return describeDecline(this.#table, code);
  }

  async mint(req: MintRequest): Promise<CardRecord> {
    assertDate(req.now, "now");
    const { decision, limitMinor } = approvedLimit(req.decision);
    const existing = this.#mintedFor(decision.id);
    if (existing !== undefined) return this.#repeatMint(existing, decision, limitMinor, req);
    assertCeiling(limitMinor, this.#limits);
    const expiresAt = cardExpiry(decision, req.ttlMs, req.now, this.#limits);
    assertSlotFree(activeCount(this.#state), this.#limits);
    const card = this.#newCard(decision, limitMinor, expiresAt, req);
    this.#state = addCard(this.#state, card);
    return card;
  }

  async authorise(req: AuthoriseRequest): Promise<CardEvent> {
    assertDate(req.now, "now");
    if (!Number.isSafeInteger(req.amountMinor) || req.amountMinor <= 0) {
      throw new RailSimError("INVALID_REQUEST", "amountMinor must be a positive integer");
    }
    const print = requestPrint(req);
    const seen = this.#state.byKey.get(req.idempotencyKey);
    if (seen !== undefined) {
      if (seen.print !== print) throw new RailSimError("IDEMPOTENCY_KEY_REUSED", "the key was already used for a different request");
      return seen.event;
    }
    const card = this.#cardByHandle(req.handle);
    const decline = card === undefined ? "UNKNOWN_HANDLE" : evaluateAuthorise(card, req);
    if (decline !== null) return this.#decline(card?.id ?? UNKNOWN_CARD_ID, req, decline, print);
    if (card === undefined) throw new RailSimError("INTERNAL", "authorised a card that does not exist");
    return this.#charge(card, req, print);
  }

  async void(cardId: string, now: Date): Promise<CardEvent> {
    assertDate(now, "now");
    const card = this.#state.cards.get(cardId);
    if (card === undefined) throw new RailSimError("UNKNOWN_CARD", `no card ${cardId}`);
    if (card.state !== "ACTIVE") {
      const why = card.state === "USED" ? "a used card is final, a processed payment cannot be cancelled [F2]" : `card is ${card.state}`;
      throw new RailSimError("NOT_ACTIVE", `only ACTIVE cards can be voided: ${why}`);
    }
    this.#state = setCardState(this.#state, cardId, "VOIDED");
    return lifecycleEvent(cardId, "VOIDED", now);
  }

  async expireDue(now: Date): Promise<CardEvent[]> {
    assertDate(now, "now");
    const due = [...this.#state.cards.values()].filter((c) => c.state === "ACTIVE" && Date.parse(c.expires_at) <= now.getTime());
    this.#state = due.reduce((state, card) => setCardState(state, card.id, "EXPIRED"), this.#state);
    return due.map((card) => lifecycleEvent(card.id, "EXPIRED", now));
  }

  #mintedFor(decisionId: string): CardRecord | undefined {
    const cardId = this.#state.byDecision.get(decisionId);
    return cardId === undefined ? undefined : this.#state.cards.get(cardId);
  }

  #cardByHandle(handle: string): CardRecord | undefined {
    const cardId = this.#state.byHandle.get(handle);
    return cardId === undefined ? undefined : this.#state.cards.get(cardId);
  }

  /** A repeat for the same decision: same CardRecord as minted, nothing new. Different terms: ALREADY_MINTED. */
  #repeatMint(existing: CardRecord, decision: Decision, limitMinor: number, req: MintRequest): CardRecord {
    const same =
      existing.limit_minor === limitMinor &&
      existing.mandate_id === decision.mandate_id &&
      existing.merchant_lock === req.merchantLock &&
      existing.purpose === req.purpose;
    if (!same) throw new MintError("ALREADY_MINTED", `decision ${decision.id} already has a card with other terms`);
    return Object.freeze({ ...existing, state: "ACTIVE" });
  }

  #newCard(decision: Decision, limitMinor: number, expiresAt: Date, req: MintRequest): CardRecord {
    const candidate: CardRecord = {
      id: this.#unused(() => this.#ids.cardId(), (id) => this.#state.cards.has(id), "card id"),
      decision_id: decision.id,
      mandate_id: decision.mandate_id,
      handle: this.#unused(() => this.#ids.handle(), (h) => this.#state.byHandle.has(h), "handle"),
      last4: String(this.#random.nextInt(10_000)).padStart(4, "0"),
      limit_minor: limitMinor,
      currency: "HKD",
      minted_at: req.now.toISOString(),
      expires_at: expiresAt.toISOString(),
      state: "ACTIVE",
      ...(req.merchantLock === undefined ? {} : { merchant_lock: req.merchantLock }),
      ...(req.purpose === undefined ? {} : { purpose: req.purpose }),
      simulated: true,
    };
    const checked = validateCardRecord(candidate);
    if (!checked.ok) throw new RailSimError("INVALID_REQUEST", `card would not be schema-valid: ${formatIssues(checked.errors)}`);
    return Object.freeze(candidate);
  }

  #unused(make: () => string, taken: (id: string) => boolean, what: string): string {
    for (let attempt = 0; attempt < ID_COLLISION_RETRIES; attempt += 1) {
      const id = make();
      if (!taken(id)) return id;
    }
    throw new RailSimError("INTERNAL", `the id source kept returning a ${what} already in use`);
  }

  #charge(card: CardRecord, req: AuthoriseRequest, print: string): CardEvent {
    const event = authorisedEvent(card, req);
    assertValidEvent(event);
    this.#state = recordCharge(this.#state, card.id, req.idempotencyKey, { print, event });
    return event;
  }

  async #decline(cardId: string, req: AuthoriseRequest, code: DeclineCode, print: string): Promise<CardEvent> {
    const event = declinedEvent(cardId, req, code);
    assertValidEvent(event);
    this.#state = recordKey(this.#state, req.idempotencyKey, { print, event });
    const entry = this.#table.entries[code];
    if (entry.timing === "deferred" && this.#sleep !== undefined) await this.#sleep(entry.delay_ms ?? 0);
    return event;
  }
}
