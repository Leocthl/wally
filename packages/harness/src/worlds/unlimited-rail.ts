// The ungoverned baseline's payment instrument: a card on file. SIMULATED, harness-owned, and not a product component.
// It has no limit, no single-use rule, no merchant lock and no expiry; it keeps one property of any payment API, an
// idempotency key (a retry with the same key returns the first answer). It exists so B0 can be "no rail limit" while
// the real RailSim, which enforces the approved total at mint (I2), stays on the governed path only.
import type { CardRecord } from "@wally/core/generated";
import type { AuthoriseRequest, CardEvent, MintRequest, RailPort } from "@wally/core/ports";

/** limit_minor of a card with no limit. Reported as null in outcomes. */
export const NO_LIMIT_MINOR = Number.MAX_SAFE_INTEGER;

const pad = (n: number): string => String(n).padStart(6, "0");

export class UnlimitedCardRail implements RailPort {
  #cards: readonly CardRecord[] = [];
  #answers: ReadonlyMap<string, CardEvent> = new Map();

  async mint(req: MintRequest): Promise<CardRecord> {
    const n = this.#cards.length + 1;
    const card: CardRecord = {
      id: `crd_unlimited${pad(n)}`,
      decision_id: req.decision.id,
      mandate_id: req.decision.mandate_id,
      handle: `hdl_UNLIMITEDcard${pad(n)}`,
      last4: "0000",
      limit_minor: NO_LIMIT_MINOR,
      currency: "HKD",
      minted_at: req.now.toISOString(),
      expires_at: req.decision.packet.expires_at,
      state: "ACTIVE",
      simulated: true,
    };
    this.#cards = [...this.#cards, card];
    return card;
  }

  async authorise(req: AuthoriseRequest): Promise<CardEvent> {
    const seen = this.#answers.get(req.idempotencyKey);
    if (seen !== undefined) return seen;
    const card = this.#cards.find((c) => c.handle === req.handle);
    const base = { at: req.now.toISOString(), amount_minor: req.amountMinor, merchant_domain: req.merchantDomain, idempotency_key: req.idempotencyKey, simulated: true } as const;
    const event: CardEvent =
      card === undefined
        ? { card_id: "crd_unknown", event: "DECLINED", decline_code: "UNKNOWN_HANDLE", ...base }
        : { card_id: card.id, event: "AUTHORISED", ...base };
    this.#answers = new Map([...this.#answers, [req.idempotencyKey, event]]);
    return event;
  }

  async void(): Promise<CardEvent> {
    throw new Error("a card on file cannot be voided here: the ungoverned baseline has no orchestrator");
  }

  async expireDue(): Promise<CardEvent[]> {
    return [];
  }
}
