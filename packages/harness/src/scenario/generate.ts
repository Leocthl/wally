// The seeded scenario generator. Scenario i is a pure function of (seed, i): same seed, same scenarios, and a
// shorter run is a prefix of a longer one. Category per slot comes from config.SLOTS; the variant cycles per category.
import { SCENARIO_SPACING_MS, SLOTS, type Category } from "../config";
import { createRng, deriveSeed, hashString } from "../prng";
import type { Scenario } from "../types";
import { FEES, SHIPPING_OVERFLOW, WITHIN_BUDGET } from "./variants/budget";
import { FLAGGED_SELLER, INJECTED_TEXT, OFF_CATEGORY, PADDED_LISTING } from "./variants/listing";
import { DUPLICATE, JUDGE_DOWN, PRICE_DRIFT, RAIL_TIMEOUT, REPLAY, WRONG_MERCHANT } from "./variants/rail";
import type { VariantDef } from "./variants/shared";
import { EXPIRED, REVOKED, VELOCITY_BURST } from "./variants/state";
import { assertScenarioValid } from "./validate";
import { assemble, epochMs, makeTag, scenarioId, type Ctx } from "./world";

export const CATEGORY_VARIANTS: Readonly<Record<Category, readonly VariantDef[]>> = {
  within_budget: WITHIN_BUDGET,
  shipping_overflow: SHIPPING_OVERFLOW,
  price_drift: PRICE_DRIFT,
  velocity_burst: VELOCITY_BURST,
  expired: EXPIRED,
  revoked: REVOKED,
  injected_text: INJECTED_TEXT,
  padded_listing: PADDED_LISTING,
  flagged_seller: FLAGGED_SELLER,
  off_category: OFF_CATEGORY,
  fees: FEES,
  duplicate: DUPLICATE,
  replay: REPLAY,
  wrong_merchant: WRONG_MERCHANT,
  rail_timeout: RAIL_TIMEOUT,
  judge_down: JUDGE_DOWN,
};

/** Variants in cycle order: round-robin over the copies so repeated variants are spread out, not clustered. */
export function expandCycle(variants: readonly VariantDef[]): readonly VariantDef[] {
  const rounds = Math.max(...variants.map((v) => v.copies ?? 1));
  return Array.from({ length: rounds }, (_, r) => variants.filter((v) => (v.copies ?? 1) > r)).flat();
}

const CYCLES: Readonly<Record<Category, readonly VariantDef[]>> = Object.fromEntries(
  (Object.keys(CATEGORY_VARIANTS) as Category[]).map((c) => [c, expandCycle(CATEGORY_VARIANTS[c])]),
) as Record<Category, readonly VariantDef[]>;

const SLOTS_PER_CATEGORY: ReadonlyMap<Category, number> = SLOTS.reduce((acc, c) => new Map(acc).set(c, (acc.get(c) ?? 0) + 1), new Map<Category, number>());

/** How many earlier scenarios (index < i) belong to the same category. */
export function occurrenceOf(index: number): number {
  const category = SLOTS[index % SLOTS.length] as Category;
  const periods = Math.floor(index / SLOTS.length);
  const inPeriod = SLOTS.slice(0, index % SLOTS.length).filter((c) => c === category).length;
  return periods * (SLOTS_PER_CATEGORY.get(category) ?? 1) + inPeriod;
}

export interface GenerateOptions {
  readonly seed: number;
  readonly n: number;
}

function contextFor(seed: number, index: number): Ctx {
  const category = SLOTS[index % SLOTS.length] as Category;
  const cycle = CYCLES[category];
  const occurrence = occurrenceOf(index);
  const offset = hashString(`${seed}:${category}`) % cycle.length;
  const variant = cycle[(occurrence + offset) % cycle.length] as VariantDef;
  return {
    seed,
    index,
    occurrence,
    category,
    variant: variant.name,
    rng: createRng(deriveSeed(seed, index)),
    nowMs: epochMs() + index * SCENARIO_SPACING_MS,
    tag: makeTag(seed, index),
    scenarioId: scenarioId(seed, index, category),
  };
}

export function generateScenarios(opts: GenerateOptions): readonly Scenario[] {
  if (!Number.isInteger(opts.n) || opts.n < 1) throw new RangeError(`n must be a positive integer, got ${opts.n}`);
  createRng(opts.seed); // validates the seed
  return Array.from({ length: opts.n }, (_, index) => {
    const ctx = contextFor(opts.seed, index);
    const variant = CYCLES[ctx.category].find((v) => v.name === ctx.variant);
    if (!variant) throw new Error(`no variant ${ctx.variant} in ${ctx.category}`);
    const scenario = assemble(ctx, variant.build(ctx));
    assertScenarioValid(scenario);
    return scenario;
  });
}
