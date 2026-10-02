// Interim checkout executor (TASKS A-22, A-34 build the real one in core): re-quote before paying (R12), present the
// handle with an idempotency key, retry a lost response with the same key. Fail closed: any doubt means no payment.
import { CHECKOUT_RETRIES } from "../config";
import type { CheckoutExecutor, CheckoutInput, CheckoutReport } from "./types";

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

async function voidQuietly(input: CheckoutInput) {
  try {
    return await input.rail.void(input.card.id, input.now);
  } catch {
    return null; // not ACTIVE any more: nothing to void
  }
}

async function drifted(input: CheckoutInput): Promise<boolean | "error"> {
  try {
    const q = await input.merchant.quote({ cart: input.cart, now: input.now });
    const c = input.cart;
    return q.total_minor !== c.total_minor || q.subtotal_minor !== c.subtotal_minor || q.shipping_minor !== c.shipping_minor || q.fees_minor !== c.fees_minor || q.fx_minor !== (c.fx?.fee_minor ?? 0);
  } catch {
    return "error";
  }
}

export function createInterimExecutor(retries: number = CHECKOUT_RETRIES): CheckoutExecutor {
  return {
    async checkout(input: CheckoutInput): Promise<CheckoutReport> {
      if (input.requote) {
        const changed = await drifted(input);
        if (changed === "error") return { drift: false, voided: await voidQuietly(input), event: null, error: "re-quote failed: price unverified, card voided" };
        if (changed) return { drift: true, voided: await voidQuietly(input), event: null, error: null };
      }
      let lastError = "no attempt made";
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const event = await input.merchant.checkout({ cart: input.cart, handle: input.card.handle, idempotencyKey: input.idempotencyKey, now: input.now });
          return { drift: false, voided: null, event, error: null };
        } catch (err) {
          lastError = message(err);
        }
      }
      return { drift: false, voided: null, event: null, error: `checkout failed after retries: ${lastError}` };
    },
  };
}
