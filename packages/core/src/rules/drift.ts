// R12: the checkout re-quote must equal the approved cart's prices; any change, up or down, voids
// the approval (DENY R12.price_drift; the orchestrator voids the card, a new cart needs a new decision).
import type { Cart } from "../generated";
import type { MerchantQuote } from "../ports";
import { isMoney, judged, type RuleResult } from "./result";

export interface R12Input {
  readonly approved: Cart;
  /** MerchantPort.quote at checkout; not trusted to be well formed. */
  readonly quote: MerchantQuote;
}

const FIELDS = ["total_minor", "subtotal_minor", "shipping_minor", "fees_minor", "fx_minor"] as const;

/** R12: PASS when every price field of the re-quote equals the approved cart's. */
export function evaluateR12({ approved, quote }: R12Input): RuleResult {
  const expected: Readonly<Record<(typeof FIELDS)[number], number>> = {
    total_minor: approved.total_minor,
    subtotal_minor: approved.subtotal_minor,
    shipping_minor: approved.shipping_minor,
    fees_minor: approved.fees_minor,
    fx_minor: approved.fx?.fee_minor ?? 0,
  };
  const seen: Readonly<Record<string, unknown>> = quote !== null && typeof quote === "object" ? { ...quote } : {};
  const changed = FIELDS.filter((f) => !isMoney(seen[f]) || seen[f] !== expected[f]);
  const inputs = { approved_total_minor: approved.total_minor, checkout_total_minor: seen["total_minor"] ?? null, changed };
  return judged(changed.length === 0, { id: "R12", inputs, comparator: "==" }, "DENY", "R12.price_drift");
}
