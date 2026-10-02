// What the model is shown. Text only: numbers appear as "HK$..." strings, the way a listing page shows them.
import type { Cart, Mandate, PacketState } from "@laisee/core/generated";
import type { JudgeInput } from "@laisee/core/ports";
import { formatHkd } from "../scenario/money";

export interface ListingState {
  readonly title: string;
  readonly description: string;
  readonly price: string;
  readonly seller: string;
  readonly shipping: string;
}

export interface JudgeState {
  readonly mandate: string;
  readonly listing: ListingState;
}

/**
 * The seller is the merchant's name only. The Scameter capture state is R9's input and R9 decides it deterministically; it is
 * not sent to the model. A first version appended "seller check: NO_RECORD" here; probing the live server showed that wording
 * alone pulled P(clean) down on legitimate listings (mean 0.35 against 0.42 over ten of them), so it was dropped.
 */
export function listingState(cart: Cart, listingText: string): ListingState {
  return {
    title: cart.items.map((i) => i.title).join("; "),
    description: listingText,
    price: formatHkd(cart.subtotal_minor),
    seller: cart.merchant.name,
    shipping: cart.shipping_minor === 0 ? "free" : formatHkd(cart.shipping_minor),
  };
}

export function judgeState(input: JudgeInput): JudgeState {
  return { mandate: input.intentText, listing: listingState(input.cart, input.listingText) };
}

export interface BudgetFacts {
  readonly packet_remaining: string;
  readonly per_purchase_rules: string;
  readonly cart_total: string;
  readonly cart_breakdown: string;
}

/**
 * The numbers B0's model needs to answer budget_fit, as text. No arithmetic happens here: an adaptive cap is stated as
 * a share of the money left and the model has to work out what that comes to.
 */
export function budgetFacts(mandate: Mandate, packet: PacketState, cart: Cart): BudgetFacts {
  const pp = mandate.rules.per_purchase;
  const rules = [
    pp?.hard_cap_minor === undefined ? null : `hard cap ${formatHkd(pp.hard_cap_minor)} per purchase`,
    pp?.share_of_remaining_bp === undefined ? null : `at most ${pp.share_of_remaining_bp / 100}% of the money left in the packet per purchase`,
  ].filter((r): r is string => r !== null);
  const fx = cart.fx === null ? "" : `, fx fee ${formatHkd(cart.fx.fee_minor)}`;
  return {
    packet_remaining: formatHkd(packet.remaining_minor),
    per_purchase_rules: rules.length === 0 ? "none" : rules.join("; "),
    cart_total: formatHkd(cart.total_minor),
    cart_breakdown: `items ${formatHkd(cart.subtotal_minor)}, shipping ${formatHkd(cart.shipping_minor)}, fees ${formatHkd(cart.fees_minor)}${fx}`,
  };
}
