import type { CardEvent, MerchantPort, MerchantQuote, RailPort } from "../ports";
import type { Cart } from "../generated";

/** Honest merchant stub for tests: quotes the cart as approved and charges exactly its total. */
export class FakeMerchant implements MerchantPort {
  readonly #rail: RailPort;

  constructor(rail: RailPort) {
    this.#rail = rail;
  }

  async quote(input: { cart: Cart; now: Date }): Promise<MerchantQuote> {
    const { cart } = input;
    return {
      total_minor: cart.total_minor,
      subtotal_minor: cart.subtotal_minor,
      shipping_minor: cart.shipping_minor,
      fees_minor: cart.fees_minor,
      fx_minor: cart.fx?.fee_minor ?? 0,
    };
  }

  async checkout(input: { cart: Cart; handle: string; idempotencyKey: string; now: Date }): Promise<CardEvent> {
    return this.#rail.authorise({
      handle: input.handle,
      amountMinor: input.cart.total_minor,
      merchantDomain: input.cart.merchant.domain,
      now: input.now,
      idempotencyKey: input.idempotencyKey,
    });
  }
}
