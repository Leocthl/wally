// R3 total <= packet remaining, R4 per-purchase cap and ask_above, R5 rail ceiling [F1].
// Money is integer HKD minor units; the adaptive cap uses BigInt so no float touches money.
import type { EngineConfig } from "../config";
import type { Cart, Mandate, PacketState } from "../generated";
import { failed, isMoney, judged, passed, skipped, type RuleResult } from "./result";

/** Basis points per whole (unit definition for share_of_remaining_bp, mandate.schema.json). */
const BP_PER_WHOLE = 10_000n;

export interface CartTotals {
  readonly itemsSubtotal: number | null;
  readonly computedTotal: number | null;
  /** subtotal == sum(qty * unit price) and total == subtotal + shipping + fees + FX fee, all money. */
  readonly consistent: boolean;
}

function sumMoney(values: readonly unknown[]): number | null {
  let total = 0;
  for (const v of values) {
    if (!isMoney(v)) return null;
    total += v;
  }
  return Number.isSafeInteger(total) ? total : null;
}

/** The cart boundary check (cart.schema.json description), recomputed so the engine fails closed on its own. */
export function cartTotals(cart: Cart): CartTotals {
  const lines = cart.items.map((item) => (isMoney(item.qty) && isMoney(item.unit_price_minor) ? item.qty * item.unit_price_minor : -1));
  const itemsSubtotal = sumMoney(lines);
  const computedTotal = sumMoney([cart.subtotal_minor, cart.shipping_minor, cart.fees_minor, cart.fx?.fee_minor ?? 0]);
  const consistent =
    itemsSubtotal !== null && computedTotal !== null && itemsSubtotal === cart.subtotal_minor && computedTotal === cart.total_minor && isMoney(cart.total_minor);
  return { itemsSubtotal, computedTotal, consistent };
}

export interface R3Input {
  readonly cart: Cart;
  readonly packet: PacketState;
}

/** R3: DENY R3.over_remaining unless total (incl. shipping, fees, FX) <= remaining. */
export function evaluateR3({ cart, packet }: R3Input): RuleResult {
  const spec = { id: "R3" as const, comparator: "<=" as const, thresholdRef: "packet.remaining_minor" };
  if (cart.currency !== packet.currency) {
    const inputs = { total_minor: cart.total_minor, currency: cart.currency, packet_currency: packet.currency, currency_mismatch: true };
    return failed({ id: "R3", inputs, comparator: "==" }, "DENY", "R3.over_remaining");
  }
  const totals = cartTotals(cart);
  if (!totals.consistent) {
    const inputs = {
      total_minor: cart.total_minor,
      computed_total_minor: totals.computedTotal,
      items_subtotal_minor: totals.itemsSubtotal,
      subtotal_minor: cart.subtotal_minor,
      remaining_minor: packet.remaining_minor,
      total_mismatch: true,
    };
    return failed({ id: "R3", inputs, comparator: "==" }, "DENY", "R3.over_remaining");
  }
  const remaining = isMoney(packet.remaining_minor) ? packet.remaining_minor : 0;
  const inputs = { total_minor: cart.total_minor, remaining_minor: packet.remaining_minor };
  return judged(cart.total_minor <= remaining, { ...spec, inputs }, "DENY", "R3.over_remaining");
}

export interface R4Input {
  readonly mandate: Mandate;
  readonly packet: PacketState;
  readonly cart: Cart;
}

const REF_HARD = "mandate.rules.per_purchase.hard_cap_minor";
const REF_SHARE = "mandate.rules.per_purchase.share_of_remaining_bp";
const REF_ASK = "mandate.rules.per_purchase.ask_above_minor";

function shareCap(remaining: unknown, bp: number | undefined): number | null {
  if (bp === undefined) return null;
  const base = isMoney(remaining) ? BigInt(remaining) : 0n;
  return Number((base * BigInt(Math.trunc(bp))) / BP_PER_WHOLE);
}

/** R4: DENY R4.over_cap over min(hard cap, share of remaining); ESCALATE R4.ask_above over ask_above. */
export function evaluateR4({ mandate, packet, cart }: R4Input): RuleResult {
  const pp = mandate.rules.per_purchase;
  if (pp === undefined) return skipped("R4", { per_purchase: null });
  const hard = pp.hard_cap_minor ?? null;
  const share = shareCap(packet.remaining_minor, pp.share_of_remaining_bp);
  const caps = [hard, share].filter((c): c is number => c !== null);
  const cap = caps.length > 0 ? Math.min(...caps) : null;
  const ask = pp.ask_above_minor ?? null;
  const total = cart.total_minor;
  const inputs = {
    total_minor: total,
    cap_minor: cap,
    hard_cap_minor: hard,
    share_of_remaining_bp: pp.share_of_remaining_bp ?? null,
    share_cap_minor: share,
    remaining_minor: packet.remaining_minor,
    ask_above_minor: ask,
  };
  const capRef = cap !== null && cap === hard ? REF_HARD : REF_SHARE;
  if (cap !== null && total > cap) {
    return failed({ id: "R4", inputs, comparator: "<=", thresholdRef: capRef }, "DENY", "R4.over_cap");
  }
  if (ask !== null && total > ask) {
    return failed({ id: "R4", inputs, comparator: "<=", thresholdRef: REF_ASK }, "ESCALATE", "R4.ask_above");
  }
  return passed({ id: "R4", inputs, comparator: "<=", thresholdRef: cap !== null ? capRef : REF_ASK });
}

export interface R5Input {
  readonly cart: Cart;
  readonly config: EngineConfig;
}

/** R5: DENY R5.over_ceiling unless total <= the per-card rail ceiling [F1.ceiling]. */
export function evaluateR5({ cart, config }: R5Input): RuleResult {
  const ceiling = config.rail.ceiling_minor;
  const inputs = { total_minor: cart.total_minor, ceiling_minor: ceiling };
  const ok = isMoney(cart.total_minor) && cart.total_minor <= ceiling;
  return judged(ok, { id: "R5", inputs, comparator: "<=", thresholdRef: "F1.ceiling" }, "DENY", "R5.over_ceiling");
}
