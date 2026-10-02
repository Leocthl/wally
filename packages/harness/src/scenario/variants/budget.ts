// Categories about money: within_budget, shipping_overflow, fx. Boundaries sit on both sides of every limit.
import { RAIL } from "../../config";
import { convertMinor, percentOfBp } from "../money";
import { FX_TEMPLATE } from "../templates";
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
      const frame = moneyFrame(ctx, "hard");
      const cap = frame.perPurchase?.hardCapMinor ?? frame.allowedMinor;
      return overflowSpec(ctx, frame, cap, delta(ctx, BOUNDARY_DELTA), stoppedLabel({ decision: "DENY", rule: "R4", templateId: "R4.over_cap", stop: "S1", note: "shipping pushes the total past the per-purchase hard cap" }));
    },
  },
  {
    name: "exact_remaining",
    build: (ctx) => {
      const frame = moneyFrame(ctx, "none");
      const shippingMinor = ctx.rng.pick([1_500, 2_500, 3_000] as const);
      const template = pickClean(ctx);
      return {
        ...cleanSpec(ctx, frame, frame.remainingMinor, approvedLabel({ note: "shipping included, total equals what the packet has left" })),
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
      const frame = moneyFrame(ctx, "none", budgetMinor);
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

// ---------- fx: converted total including the fee [F3] ----------

const FX_CURRENCIES = ["USD", "EUR", "GBP", "CAD"] as const; // SIMULATED listing currencies
const FX_RATES = ["5.60", "7.50", "8.20", "9.80"] as const; // SIMULATED decimal strings, not market rates

interface FxFrame {
  readonly currency: string;
  readonly listed: number;
  readonly rate: string;
  readonly converted: number;
  readonly shipping: number;
  readonly fee: number;
  readonly total: number;
}

function fxFrame(ctx: Ctx): FxFrame {
  const listed = ctx.rng.int(2_500, 7_000);
  const rate = ctx.rng.pick(FX_RATES);
  const converted = convertMinor(listed, rate);
  const shipping = ctx.rng.pick([0, 3_000, 4_500] as const);
  const fee = percentOfBp(converted, 100); // F3.fx_settled_hkd
  return { currency: ctx.rng.pick(FX_CURRENCIES), listed, rate, converted, shipping, fee, total: converted + shipping + fee };
}

function fxSpec(ctx: Ctx, f: FxFrame, remainingMinor: number, label: DraftSpec["label"]): DraftSpec {
  const budgetMinor = remainingMinor + roundTo(ctx.rng.int(0, 40_000), 10);
  return {
    template: FX_TEMPLATE,
    budgetMinor,
    remainingMinor,
    capture: freshCapture(ctx),
    unitPriceMinor: f.converted,
    shippingMinor: f.shipping,
    text: `${bodyFor(ctx, FX_TEMPLATE, f.shipping)} Listed price ${f.currency} ${(f.listed / 100).toFixed(2)}, charged in HKD.`,
    fx: { listedCurrency: f.currency, listedAmountMinor: f.listed, rate: f.rate },
    label,
  };
}

export const FX: readonly VariantDef[] = [
  {
    name: "fee_pushes_over",
    build: (ctx) => {
      const f = fxFrame(ctx);
      return fxSpec(ctx, f, f.converted + f.shipping + Math.floor(f.fee / 2), stoppedLabel({ decision: "DENY", rule: "R3", templateId: "R3.over_remaining", stop: "S1", note: "converted price fits, the FX fee [F3] pushes the total past what is left" }));
    },
  },
  {
    name: "fits",
    build: (ctx) => {
      const f = fxFrame(ctx);
      return fxSpec(ctx, f, f.total + ctx.rng.int(500, 20_000), approvedLabel({ note: "foreign-currency listing, converted total incl. fee inside the packet" }));
    },
  },
  {
    name: "converted_over",
    build: (ctx) => {
      const f = fxFrame(ctx);
      return fxSpec(ctx, f, f.converted - ctx.rng.int(100, 3_000), stoppedLabel({ decision: "DENY", rule: "R3", templateId: "R3.over_remaining", stop: "S1", note: "converted price alone is over what is left" }));
    },
  },
  {
    name: "exact",
    build: (ctx) => {
      const f = fxFrame(ctx);
      return fxSpec(ctx, f, f.total, approvedLabel({ note: "converted total incl. fee equals what the packet has left" }));
    },
  },
];
