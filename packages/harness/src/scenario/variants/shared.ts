// Helpers every category module uses: money frames, label constructors, template picks.
import type { RuleId, TemplateId } from "@wally/core/generated";
import { EXAMPLE_MANDATE } from "../../config";
import type { DecisionOutcome, PaymentExpectation, ScenarioLabel, StopId } from "../../types";
import { cleanTemplates, type Template } from "../templates";
import { listingBody } from "../texts";
import { allowedLimit, type Ctx, type DraftSpec, type PerPurchase } from "../world";

export interface VariantDef {
  readonly name: string;
  /** How many slots the variant takes in the cycle; controls get extra copies so each category keeps legitimate traffic. */
  readonly copies?: number;
  readonly build: (ctx: Ctx) => DraftSpec;
}

export const roundTo = (x: number, step: number): number => Math.round(x / step) * step;

export function between(ctx: Ctx, lowPct: number, highPct: number, of: number, step = 10): number {
  return roundTo((of * ctx.rng.int(lowPct, highPct)) / 100, step);
}

export function pickClean(ctx: Ctx): Template {
  return ctx.rng.pick(cleanTemplates());
}

// ---------- labels ----------

interface LabelBase {
  readonly note: string;
  readonly klass?: ScenarioLabel["class"];
}

/** A legitimate purchase that completes with one authorised charge. */
export function approvedLabel(base: LabelBase, over: Partial<ScenarioLabel> = {}): ScenarioLabel {
  return {
    legitimate: true,
    class: base.klass ?? "deterministic",
    decision: "APPROVE",
    rule: null,
    templateId: null,
    stop: null,
    payment: { kind: "authorised" },
    replayDeclined: false,
    expectedMints: 1,
    note: base.note,
    ...over,
  };
}

/** A stop at decision time: no card, no charge. */
export function stoppedLabel(
  base: LabelBase & {
    readonly decision: Exclude<DecisionOutcome, "APPROVE">;
    readonly rule: RuleId;
    readonly templateId: TemplateId;
    readonly stop: StopId | null;
  },
): ScenarioLabel {
  return {
    legitimate: false,
    class: base.klass ?? "deterministic",
    decision: base.decision,
    rule: base.rule,
    templateId: base.templateId,
    stop: base.stop,
    payment: { kind: "none" },
    replayDeclined: false,
    expectedMints: 0,
    note: base.note,
  };
}

/** Approved at decision time, then stopped after the mint (rail or executor). */
export function afterMintLabel(
  base: LabelBase & {
    readonly payment: Exclude<PaymentExpectation, { kind: "none" }>;
    readonly rule?: RuleId;
    readonly templateId?: TemplateId;
    readonly stop?: StopId;
    readonly legitimate?: boolean;
  },
): ScenarioLabel {
  return {
    legitimate: base.legitimate ?? false,
    class: base.klass ?? "deterministic",
    decision: "APPROVE",
    rule: base.rule ?? null,
    templateId: base.templateId ?? null,
    stop: base.stop ?? null,
    payment: base.payment,
    replayDeclined: false,
    expectedMints: 1,
    note: base.note,
  };
}

// ---------- money frames ----------

export type CapKind = "none" | "hard" | "adaptive" | "ask" | "hard_ask";

export interface MoneyFrame {
  readonly budgetMinor: number;
  readonly remainingMinor: number;
  readonly perPurchase: PerPurchase | undefined;
  /** min(remaining, effective cap): the most a purchase may cost without an overspend. */
  readonly allowedMinor: number;
  /** Highest total that is neither over a limit nor above ask_above. */
  readonly freeMinor: number;
}

const BUDGETS = [60_000, 100_000, 120_000] as const; // SIMULATED packet sizes next to the F20 example

export function pickBudget(ctx: Ctx): number {
  return ctx.rng.chance(1, 2) ? EXAMPLE_MANDATE.budgetMinor : ctx.rng.pick(BUDGETS);
}

export function perPurchaseOf(ctx: Ctx, kind: CapKind, remainingMinor: number): PerPurchase | undefined {
  const hard = roundTo((remainingMinor * ctx.rng.int(35, 75)) / 100, 100);
  const share = ctx.rng.pick([3_000, EXAMPLE_MANDATE.adaptiveShareBp, 6_500] as const);
  const ask = roundTo((remainingMinor * ctx.rng.int(30, 60)) / 100, 100);
  switch (kind) {
    case "none":
      return undefined;
    case "hard":
      return { hardCapMinor: hard };
    case "adaptive":
      return { shareBp: share };
    case "ask":
      return { askAboveMinor: ask };
    case "hard_ask":
      return { hardCapMinor: hard, askAboveMinor: roundTo(hard * 0.6, 100) };
  }
}

export function moneyFrame(ctx: Ctx, kind: CapKind, budgetOverride?: number, maxSpentPct = 55): MoneyFrame {
  const budgetMinor = budgetOverride ?? pickBudget(ctx);
  const spent = roundTo((budgetMinor * ctx.rng.int(0, maxSpentPct)) / 100, 10);
  const remainingMinor = budgetMinor - spent;
  const perPurchase = perPurchaseOf(ctx, kind, remainingMinor);
  const allowedMinor = allowedLimit(perPurchase, remainingMinor);
  const freeMinor = Math.min(allowedMinor, perPurchase?.askAboveMinor ?? allowedMinor);
  return { budgetMinor, remainingMinor, perPurchase, allowedMinor, freeMinor };
}

export const CAP_KINDS: readonly CapKind[] = ["none", "none", "hard", "adaptive", "ask", "hard_ask"];

/** Splits a target total into item price and shipping; shipping is zero or one of a few SIMULATED flat rates. */
export function splitTotal(ctx: Ctx, totalMinor: number): { unitPriceMinor: number; shippingMinor: number } {
  const options = [0, 0, 1_500, 2_500, 3_000, 4_500].filter((s) => s * 3 <= totalMinor);
  const shippingMinor = ctx.rng.pick(options);
  return { unitPriceMinor: totalMinor - shippingMinor, shippingMinor };
}

const FREE_SHIPPING = /Free shipping/;
const FLAT_SHIPPING = /Shipping HK\$(\d+)\./;

/** Shipping a fixture text states, in minor units, or null when it states none. */
function statedShipping(text: string): number | null {
  if (FREE_SHIPPING.test(text)) return 0;
  const m = FLAT_SHIPPING.exec(text);
  return m?.[1] === undefined ? null : Number(m[1]) * 100;
}

/** Listing prose for a template: the fixture text when its shipping line matches, else a generated body. */
export function bodyFor(ctx: Ctx, tpl: Template, shippingMinor: number): string {
  const reuse = ctx.rng.chance(2, 3);
  if (reuse && tpl.fixtureText !== null && statedShipping(tpl.fixtureText) === shippingMinor) return tpl.fixtureText;
  return listingBody(ctx.rng, tpl.title, shippingMinor);
}

/** Capture that is fresh under every limit the harness uses (F52). */
export function freshCapture(ctx: Ctx): { readonly state: "NO_RECORD"; readonly ageS: number } {
  return { state: "NO_RECORD", ageS: ctx.rng.int(1, 12) * 3_600 };
}

/** Spec skeleton for a clean apparel purchase of `totalMinor`; categories override what they test. */
export function cleanSpec(ctx: Ctx, frame: MoneyFrame, totalMinor: number, label: ScenarioLabel): DraftSpec {
  const template = pickClean(ctx);
  const { unitPriceMinor, shippingMinor } = splitTotal(ctx, totalMinor);
  return {
    template,
    budgetMinor: frame.budgetMinor,
    remainingMinor: frame.remainingMinor,
    ...(frame.perPurchase === undefined ? {} : { perPurchase: frame.perPurchase }),
    capture: freshCapture(ctx),
    unitPriceMinor,
    shippingMinor,
    text: bodyFor(ctx, template, shippingMinor),
    label,
  };
}
