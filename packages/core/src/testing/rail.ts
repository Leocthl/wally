// Test double for RailPort (SIMULATED). Not the real rail-sim (lane A); just enough F1 semantics
// for wiring tests: idempotent mint per decision, exact limit, single use, merchant lock, idempotency keys.
import type { CardRecord } from "../generated";
import { MintError, type AuthoriseRequest, type CardEvent, type MintRequest, type RailPort } from "../ports";

export interface FakeRailOptions {
  /** Per-card ceiling, minor units. Default HK$2,000 [F1]. */
  readonly ceilingMinor?: number;
  /** Max ACTIVE cards. Default 2 [F1]. */
  readonly maxActive?: number;
  /** Longest TTL accepted. Default 30 min [F30]. */
  readonly maxTtlMs?: number;
}

const UNKNOWN_CARD_ID = "crd_unknown";

export class FakeRail implements RailPort {
  readonly #ceilingMinor: number;
  readonly #maxActive: number;
  readonly #maxTtlMs: number;
  #cards: ReadonlyMap<string, CardRecord> = new Map();
  #byDecision: ReadonlyMap<string, string> = new Map();
  #byKey: ReadonlyMap<string, CardEvent> = new Map();

  constructor(options: FakeRailOptions = {}) {
    this.#ceilingMinor = options.ceilingMinor ?? 200_000;
    this.#maxActive = options.maxActive ?? 2;
    this.#maxTtlMs = options.maxTtlMs ?? 30 * 60 * 1000;
  }

  /** Current card records (state included), oldest first. */
  get cards(): readonly CardRecord[] {
    return [...this.#cards.values()];
  }

  async mint(req: MintRequest): Promise<CardRecord> {
    const { decision } = req;
    const limit = decision.approved_limit_minor;
    if (decision.outcome !== "APPROVE" || limit === undefined) throw new MintError("NOT_APPROVED");
    const existingId = this.#byDecision.get(decision.id);
    const existing = existingId ? this.#cards.get(existingId) : undefined;
    if (existing) {
      if (existing.merchant_lock !== req.merchantLock || existing.purpose !== req.purpose) throw new MintError("ALREADY_MINTED");
      return existing;
    }
    if (limit > this.#ceilingMinor) throw new MintError("OVER_CEILING");
    if (req.ttlMs <= 0 || req.ttlMs > this.#maxTtlMs) throw new MintError("TTL_TOO_LONG");
    if (this.cards.filter((c) => c.state === "ACTIVE").length >= this.#maxActive) throw new MintError("MAX_ACTIVE");
    const card = this.#newCard(req, limit);
    this.#cards = new Map([...this.#cards, [card.id, card]]);
    this.#byDecision = new Map([...this.#byDecision, [decision.id, card.id]]);
    return card;
  }

  async authorise(req: AuthoriseRequest): Promise<CardEvent> {
    const seen = this.#byKey.get(req.idempotencyKey);
    if (seen) return seen;
    const card = this.cards.find((c) => c.handle === req.handle);
    const event = card ? this.#authoriseCard(card, req) : this.#declined(UNKNOWN_CARD_ID, req, "UNKNOWN_HANDLE");
    this.#byKey = new Map([...this.#byKey, [req.idempotencyKey, event]]);
    return event;
  }

  async void(cardId: string, now: Date): Promise<CardEvent> {
    const card = this.#cards.get(cardId);
    if (!card || card.state !== "ACTIVE") throw new Error(`void: ${cardId} is not ACTIVE`);
    this.#setState(card, "VOIDED");
    return { card_id: cardId, event: "VOIDED", at: now.toISOString(), simulated: true };
  }

  async expireDue(now: Date): Promise<CardEvent[]> {
    const due = this.cards.filter((c) => c.state === "ACTIVE" && Date.parse(c.expires_at) <= now.getTime());
    due.forEach((c) => this.#setState(c, "EXPIRED"));
    return due.map((c) => ({ card_id: c.id, event: "EXPIRED", at: now.toISOString(), simulated: true }));
  }

  #authoriseCard(card: CardRecord, req: AuthoriseRequest): CardEvent {
    if (card.state === "USED") return this.#declined(card.id, req, "CARD_USED");
    if (card.state === "VOIDED") return this.#declined(card.id, req, "CARD_VOIDED");
    if (card.state === "EXPIRED" || Date.parse(card.expires_at) <= req.now.getTime()) {
      return this.#declined(card.id, req, "CARD_EXPIRED");
    }
    if (card.merchant_lock !== undefined && card.merchant_lock !== req.merchantDomain) {
      return this.#declined(card.id, req, "MERCHANT_MISMATCH");
    }
    if (req.amountMinor > card.limit_minor) return this.#declined(card.id, req, "OVER_LIMIT");
    this.#setState(card, "USED");
    return {
      card_id: card.id,
      event: "AUTHORISED",
      at: req.now.toISOString(),
      amount_minor: req.amountMinor,
      merchant_domain: req.merchantDomain,
      idempotency_key: req.idempotencyKey,
      simulated: true,
    };
  }

  #declined(cardId: string, req: AuthoriseRequest, code: NonNullable<CardEvent["decline_code"]>): CardEvent {
    return {
      card_id: cardId,
      event: "DECLINED",
      at: req.now.toISOString(),
      amount_minor: req.amountMinor,
      merchant_domain: req.merchantDomain,
      decline_code: code,
      idempotency_key: req.idempotencyKey,
      simulated: true,
    };
  }

  #setState(card: CardRecord, state: CardRecord["state"]): void {
    this.#cards = new Map([...this.#cards, [card.id, { ...card, state }]]);
  }

  #newCard(req: MintRequest, limit: number): CardRecord {
    const n = String(this.#cards.size + 1).padStart(4, "0");
    const expiresMs = Math.min(req.now.getTime() + req.ttlMs, Date.parse(req.decision.packet.expires_at));
    const base: CardRecord = {
      id: `crd_fake${n}`,
      decision_id: req.decision.id,
      mandate_id: req.decision.mandate_id,
      handle: `hdl_FAKEhandle${n}SIMULATED`,
      last4: n,
      limit_minor: limit,
      currency: "HKD",
      minted_at: req.now.toISOString(),
      expires_at: new Date(expiresMs).toISOString(),
      state: "ACTIVE",
      simulated: true,
    };
    const locked = req.merchantLock === undefined ? base : { ...base, merchant_lock: req.merchantLock };
    return req.purpose === undefined ? locked : { ...locked, purpose: req.purpose };
  }
}
