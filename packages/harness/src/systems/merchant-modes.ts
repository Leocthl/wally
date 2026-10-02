// SIMULATED merchant behaviours around a RailPort: honest, overshoot, drift, preauth, timeout, wrong_merchant.
// Stand-in for the merchant stub in @laisee/rail-sim (TASKS A-22, A-34); the factory swaps it out when that lands.
import type { Cart } from "@laisee/core/generated";
import type { CardEvent, MerchantPort, MerchantQuote, RailPort } from "@laisee/core/ports";
import type { MerchantMode } from "@laisee/rail-sim";
import { LOOKALIKE_DOMAIN } from "../scenario/templates";

function quoteOf(cart: Cart, deltaMinor: number): MerchantQuote {
  return {
    total_minor: cart.total_minor + deltaMinor,
    subtotal_minor: cart.subtotal_minor + deltaMinor,
    shipping_minor: cart.shipping_minor,
    fees_minor: cart.fees_minor,
    fx_minor: cart.fx?.fee_minor ?? 0,
  };
}

/** What the merchant asks the rail to authorise at checkout. */
function chargeOf(mode: MerchantMode, cart: Cart, deltaMinor: number): number {
  return mode === "overshoot" || mode === "preauth" || mode === "drift" ? Math.max(1, cart.total_minor + deltaMinor) : cart.total_minor;
}

export function createModalMerchant(rail: RailPort, mode: MerchantMode, deltaMinor: number): MerchantPort {
  let lostResponses: ReadonlySet<string> = new Set();
  return {
    async quote({ cart }): Promise<MerchantQuote> {
      return quoteOf(cart, mode === "drift" ? deltaMinor : 0);
    },
    async checkout({ cart, handle, idempotencyKey, now }): Promise<CardEvent> {
      const event = await rail.authorise({
        handle,
        amountMinor: chargeOf(mode, cart, deltaMinor),
        merchantDomain: mode === "wrong_merchant" ? LOOKALIKE_DOMAIN : cart.merchant.domain,
        now,
        idempotencyKey,
      });
      if (mode === "timeout" && !lostResponses.has(idempotencyKey)) {
        lostResponses = new Set([...lostResponses, idempotencyKey]);
        throw new Error("SIMULATED timeout: the response was lost after the rail authorised");
      }
      return event;
    },
  };
}
