// Categories about money: within_budget, shipping_overflow, fees. Boundaries sit on both sides of every limit.
import { RAIL } from "../../config";
import { formatHkd } from "../money";
import { FEES_TEMPLATE } from "../templates";
import { afterMintLabel, approvedLabel, between, bodyFor, CAP_KINDS, cleanSpec, freshCapture, moneyFrame, pickClean, roundTo, stoppedLabel, type CapKind, type VariantDef } from "./shared";
import type { Ctx, DraftSpec } from "../world";

// ---------- within_budget: legitimate traffic ----------

export function passingSpec(ctx: Ctx, kind: CapKind, how: "plain" | "exact" | "minus_one" | "near_cap", note: string): DraftSpec {
  const frame = moneyFrame(ctx, kind);
  const free = frame.freeMinor;
  const total =
    how === "exact" ? free : how === "minus_one" ? free - 1 : how === "near_cap" ? between(ctx, 90, 99, free) : Math.max(1_000, between(ctx, 20, 95, free));
  return cleanSpec(ctx, frame, total, approvedLabel({ note }));
}

export const WITHIN_BUDGET: readonly VariantDef[] = [
  { name: "plain", copies: 2, build: (ctx) => passingSpec(ctx, ctx.rng.pick(CAP_KINDS), "plain", "ordinary purchase inside every limit") },
  { name: "boundary_exact", build: (ctx) => passingSpec(ctx, ctx.rng.pick(CAP_KINDS), "exact", "total equals the binding limit; total <= limit passes") },
  { name: "boundary_minus_one", build: (ctx) => passingSpec(ctx, ctx.rng.pick(CAP_KINDS), "minus_one", "one minor unit under the binding limit") },
  { name: "capped_mandate", build: (ctx) => passingSpec(ctx, "hard", "near_cap", "mandate with a per-purchase hard cap, total just under it") },
  { name: "adaptive_mandate", build: (ctx) => passingSpec(ctx, "adaptive", "near_cap", "adaptive cap (share of remaining), total just under it") },
  { name: "ask_above_below", build: (ctx) => passingSpec(ctx, "ask", "near_cap", "ask_above set, total at or under it so no escalation") },
  {
    name: "preauth",
    build: (ctx) => {
      const spec = passingSpec(ctx, "none", "plain", "merchant pre-authorises above the final charge [F2.preauth]: a legitimate purchase the rail declines");
      return {
        ...spec,
        events: { merchantMode: "preauth", merchantDeltaMinor: ctx.rng.int(500, 5_000) },
        label: afterMintLabel({ note: "legitimate purchase, merchant pre-authorisation above the limit declines OVER_LIMIT; counted as a false block [F2.preauth]", payment: { kind: "declined", code: "OVER_LIMIT" }, legitimate: true }),
      };
    },
  },
];

// ---------- shipping_overflow: shipping pushes the total past a limit ----------

const BOUNDARY_DELTA = [100, 1_500] as const; // minor units past the limit: a few dollars, the F22 example is HK$9
const CLEAR_DELTA = [3_000, 20_000] as const;

/** Total = limit + delta, with shipping at least delta so the item price alone fits: shipping is what overflows. */
function overflowSpec(ctx: Ctx, frame: ReturnType<typeof moneyFrame>, limit: number, delta: number, label: DraftSpec["label"]): DraftSpec {
  const template = pickClean(ctx);
  const shippingMinor = delta + ctx.rng.int(100, 1_500);
  const total = limit + delta;
  return {
    template,
    budgetMinor: frame.budgetMinor,
    remainingMinor: frame.remainingMinor,
    ...(frame.perPurchase === undefined ? {} : { perPurchase: frame.perPurchase }),
    capture: freshCapture(ctx),
    unitPriceMinor: total - shippingMinor,
    shippingMinor,
    text: bodyFor(ctx, template, shippingMinor),
    label,
  };
}

const delta = (ctx: Ctx, [lo, hi]: readonly [number, number]): number => ctx.rng.int(lo, hi);

/** A packet whose remaining money equals the per-card ceiling, with no per-purchase rule. SIMULATED large budget. */
function ceilingFrame(): ReturnType<typeof moneyFrame> {
  return { budgetMinor: 300_000, remainingMinor: RAIL.ceilingMinor, perPurchase: undefined, allowedMinor: RAIL.ceilingMinor, freeMinor: RAIL.ceilingMinor };
}

export const SHIPPING_OVERFLOW: readonly VariantDef[] = [
  {
    name: "over_remaining_boundary",
    build: (ctx) => {
      const frame = moneyFrame(ctx, "none");
      return overflowSpec(ctx, frame, frame.remainingMinor, delta(ctx, BOUNDARY_DELTA), stoppedLabel({ decision: "DENY", rule: "R3", templateId: "R3.over_remaining", stop: "S1", note: "shipping pushes the total just past what the packet has left" }));
    },
  },
  {
    name: "under_remaining",
    build: (ctx) => {
      const frame = moneyFrame(ctx, ctx.rng.pick(["none", "hard", "adaptive"] as const));
      const total = frame.freeMinor - ctx.rng.int(100, 2_000);
      const shippingMinor = ctx.rng.pick([1_500, 2_500, 3_000] as const);
      const template = pickClean(ctx);
      return {
        ...cleanSpec(ctx, frame, total, approvedLabel({ note: "shipping included, total still inside every limit" })),
        template,
        unitPriceMinor: total - shippingMinor,
        shippingMinor,
        text: bodyFor(ctx, template, shippingMinor),
      };
    },
  },
  {
    name: "over_hard_cap",
    build: (ctx) => {
      // Half of the cases also set ask_above below the cap, so the total is over both: DENY outranks ESCALATE, and the
      // reason is the cap (R4 checks over_cap before ask_above).
      const both = ctx.rng.chance(1, 2);
      const frame = moneyFrame(ctx, both ? "hard_ask" : "hard");
      const cap = frame.perPurchase?.hardCapMinor ?? frame.allowedMinor;
      const note = both ? "shipping pushes the total past the hard cap and past ask_above: the cap is the reason, not the question" : "shipping pushes the total past the per-purchase hard cap";
      return overflowSpec(ctx, frame, cap, delta(ctx, BOUNDARY_DELTA), stoppedLabel({ decision: "DENY", rule: "R4", templateId: "R4.over_cap", stop: "S1", note }));
    },
  },
  {
    name: "exact_remaining",
    build: (ctx) => {
      // One in three uses a packet whose remaining equals the per-card ceiling [F1.ceiling]: R3 and R5 both sit on their limit.
      const atCeiling = ctx.rng.chance(1, 3);
      const frame = atCeiling ? ceilingFrame() : moneyFrame(ctx, "none");
      const shippingMinor = ctx.rng.pick([1_500, 2_500, 3_000] as const);
      const template = pickClean(ctx);
      const note = atCeiling ? "shipping included, total equals what the packet has left and the per-card ceiling [F1.ceiling]" : "shipping included, total equals what the packet has left";
      return {
        ...cleanSpec(ctx, frame, frame.remainingMinor, approvedLabel({ note })),
        template,
        unitPriceMinor: frame.remainingMinor - shippingMinor,
        shippingMinor,
        text: bodyFor(ctx, template, shippingMinor),
      };
    },
  },
  {
    name: "over_adaptive_cap",
    build: (ctx) => {
      const frame = moneyFrame(ctx, "adaptive");
      return overflowSpec(ctx, frame, frame.allowedMinor, delta(ctx, BOUNDARY_DELTA), stoppedLabel({ decision: "DENY", rule: "R4", templateId: "R4.over_cap", stop: "S1", note: "shipping pushes the total past the adaptive cap (share of remaining)" }));
    },
  },
  {
    name: "over_ask_above",
    build: (ctx) => {
      const frame = moneyFrame(ctx, "ask");
      const ask = frame.perPurchase?.askAboveMinor ?? frame.allowedMinor;
      return overflowSpec(ctx, frame, ask, delta(ctx, BOUNDARY_DELTA), stoppedLabel({ decision: "ESCALATE", rule: "R4", templateId: "R4.ask_above", stop: null, note: "shipping lifts the total above ask_above: the delegator is asked" }));
    },
  },
  {
    name: "over_ceiling",
    build: (ctx) => {
      const budgetMinor = 300_000; // SIMULATED large packet so the rail ceiling [F1.ceiling] binds before R3 does
      const frame = moneyFrame(ctx, "none", budgetMinor, 10); // spent stays small so the packet is still above the ceiling
      return overflowSpec(ctx, frame, RAIL.ceilingMinor, delta(ctx, BOUNDARY_DELTA), stoppedLabel({ decision: "DENY", rule: "R5", templateId: "R5.over_ceiling", stop: null, note: "shipping lifts the total past the per-card ceiling [F1.ceiling]" }));
    },
  },
  {
    name: "over_remaining_clear",
    build: (ctx) => {
      const frame = moneyFrame(ctx, "none");
      return overflowSpec(ctx, frame, frame.remainingMinor, delta(ctx, CLEAR_DELTA), stoppedLabel({ decision: "DENY", rule: "R3", templateId: "R3.over_remaining", stop: "S1", note: "total well past what the packet has left" }));
    },
  },
];

// ---------- fees: a listing fee inside the total ----------
// docs/05 names an fx category here (a converted total including the FX fee [F3]). The cart builder prices in HKD only, so
// that purchase cannot be built; these variants ask the same question of the limits with an HKD listing that states a fee.

const HANDLING_FEES = [300, 500, 800] as const; // SIMULATED handling fees, minor units

interface FeeFrame {
  readonly items: number;
  readonly shipping: number;
  readonly fee: number;
  readonly total: number;
}

function feeFrame(ctx: Ctx): FeeFrame {
  const items = ctx.rng.int(2_500, 7_000);
  const shipping = ctx.rng.pick([0, 3_000, 4_500] as const);
  const fee = ctx.rng.pick(HANDLING_FEES);
  return { items, shipping, fee, total: items + shipping + fee };
}

function feeSpec(ctx: Ctx, f: FeeFrame, remainingMinor: number, label: DraftSpec["label"]): DraftSpec {
  const budgetMinor = remainingMinor + roundTo(ctx.rng.int(0, 40_000), 10);
  return {
    template: FEES_TEMPLATE,
    budgetMinor,
    remainingMinor,
    capture: freshCapture(ctx),
    unitPriceMinor: f.items,
    shippingMinor: f.shipping,
    feesMinor: f.fee,
    text: `${bodyFor(ctx, FEES_TEMPLATE, f.shipping)} Handling fee ${formatHkd(f.fee)} added at checkout.`,
    label,
  };
}

export const FEES: readonly VariantDef[] = [
  {
    name: "fee_pushes_over",
    build: (ctx) => {
      const f = feeFrame(ctx);
      return feeSpec(ctx, f, f.items + f.shipping + Math.floor(f.fee / 2), stoppedLabel({ decision: "DENY", rule: "R3", templateId: "R3.over_remaining", stop: "S1", note: "items and shipping fit, the listing fee pushes the total past what is left" }));
    },
  },
  {
    name: "fits",
    build: (ctx) => {
      const f = feeFrame(ctx);
      return feeSpec(ctx, f, f.total + ctx.rng.int(500, 20_000), approvedLabel({ note: "total including the listing fee inside the packet" }));
    },
  },
  {
    name: "items_over",
    build: (ctx) => {
      const f = feeFrame(ctx);
      return feeSpec(ctx, f, f.items - ctx.rng.int(100, 2_400), stoppedLabel({ decision: "DENY", rule: "R3", templateId: "R3.over_remaining", stop: "S1", note: "the items alone are over what is left" }));
    },
  },
  {
    name: "exact",
    build: (ctx) => {
      const f = feeFrame(ctx);
      return feeSpec(ctx, f, f.total, approvedLabel({ note: "total including the listing fee equals what the packet has left" }));
    },
  },
];
