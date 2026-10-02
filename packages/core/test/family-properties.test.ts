// Property tests for checkChildWithinParent (fast-check): a child built only by narrowing is always accepted; widening any
// single term of an accepted child is refused and names that term; allocations add up across children.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/config";
import { checkChildWithinParent, type FamilyField } from "../src/family";
import type { Mandate } from "../src/generated";
import { NOW, PARENT, budgetOf } from "./family-helpers";

const SEED = Number(process.env["FAST_CHECK_SEED"] ?? 20_261_004);
const RUNS = { numRuns: 300, seed: SEED };
const DOMAINS = ["a.example", "b.example", "c.example", "d.example"] as const;
const CATEGORIES = ["apparel", "footwear", "electronics", "groceries"] as const;
const DAY_MS = 86_400_000;
const T0 = NOW.getTime();
const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

type Rules = Mandate["rules"];
type PerPurchase = NonNullable<Rules["per_purchase"]>;

const money = (max: number) => fc.integer({ min: 1, max });
const perPurchaseArb = fc
  .record({ hard_cap_minor: money(100_000), ask_above_minor: money(100_000), share_of_remaining_bp: fc.integer({ min: 1, max: 10_000 }) }, { requiredKeys: [] })
  .filter((p) => Object.keys(p).length > 0);

const parentArb: fc.Arbitrary<Mandate> = fc
  .record({
    budget: fc.integer({ min: 1, max: 500_000 }),
    categories: fc.uniqueArray(fc.constantFrom(...CATEGORIES), { minLength: 1, maxLength: 3 }),
    allow: fc.option(fc.uniqueArray(fc.constantFrom(...DOMAINS), { maxLength: 3 }), { nil: null }),
    deny: fc.uniqueArray(fc.constantFrom(...DOMAINS), { maxLength: 2 }),
    requireCapture: fc.boolean(),
    maxAge: fc.option(fc.integer({ min: 1, max: 200_000 }), { nil: undefined }),
    perPurchase: fc.option(perPurchaseArb, { nil: undefined }),
    velocity: fc.option(fc.record({ max_mints: fc.integer({ min: 1, max: 6 }), window_s: fc.integer({ min: 1, max: 3_600 }) }), { nil: undefined }),
    days: fc.integer({ min: 2, max: 60 }),
  })
  .map(({ budget, categories, allow, deny, requireCapture, maxAge, perPurchase, velocity, days }) => ({
    ...PARENT,
    rules: {
      budget: budgetOf(budget),
      categories,
      merchants: { allow, deny },
      seller_check: maxAge === undefined ? { require_capture: requireCapture } : { require_capture: requireCapture, max_capture_age_s: maxAge },
      ...(perPurchase === undefined ? {} : { per_purchase: perPurchase }),
      ...(velocity === undefined ? {} : { velocity }),
    } as Rules,
    valid_until: iso(T0 + days * DAY_MS),
  }));

const velocityOf = (r: Rules) => ({ max: r.velocity?.max_mints ?? ENGINE_CONFIG.velocity.max_mints, windowS: r.velocity?.window_s ?? ENGINE_CONFIG.velocity.window_s });
const ageOf = (r: Rules) => r.seller_check.max_capture_age_s ?? ENGINE_CONFIG.seller.max_capture_age_s;

/** Random choices for narrowing, all in [0, 1]: one dice per rule so a failing case shrinks to one number each. */
const diceArb = fc.record({
  budget: fc.double({ min: 0, max: 1, noNaN: true }),
  cats: fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }),
  days: fc.double({ min: 0, max: 1, noNaN: true }),
  tighten: fc.double({ min: 0, max: 1, noNaN: true }),
  mode: fc.integer({ min: 0, max: 2 }),
  extraDeny: fc.boolean(),
});
type Dice = typeof diceArb extends fc.Arbitrary<infer D> ? D : never;

const scale = (n: number, d: number): number => Math.max(1, Math.floor(n * d));

function narrowPerPurchase(parent: PerPurchase | undefined, dice: Dice): PerPurchase | undefined {
  if (parent === undefined) return dice.mode === 0 ? undefined : { hard_cap_minor: 1 + Math.floor(dice.tighten * 5_000) };
  const pick = (v: number | undefined): number | undefined => (v === undefined ? undefined : scale(v, dice.tighten));
  const hard = pick(parent.hard_cap_minor);
  const ask = pick(parent.ask_above_minor);
  const share = pick(parent.share_of_remaining_bp);
  return { ...(hard === undefined ? {} : { hard_cap_minor: hard }), ...(ask === undefined ? {} : { ask_above_minor: ask }), ...(share === undefined ? {} : { share_of_remaining_bp: share }) };
}

/** A child that only narrows: every term equal to the parent's or tighter. */
function narrowed(parent: Mandate, allocated: number, dice: Dice): Mandate {
  const r = parent.rules;
  const room = Math.max(0, r.budget.amount_minor - allocated);
  const kept = r.categories.filter((_, i) => dice.cats[i % dice.cats.length] === true);
  const categories = (kept.length > 0 ? kept : [r.categories[0] ?? "apparel"]) as Rules["categories"];
  const until = Date.parse(parent.valid_until);
  const v = velocityOf(r);
  const merchants = { allow: r.merchants.allow, deny: dice.extraDeny ? [...new Set([...r.merchants.deny, "z.example"])] : r.merchants.deny };
  const perPurchase = narrowPerPurchase(r.per_purchase, dice);
  // Same count or fewer, over a window as long or longer: never more purchases in the parent's window. Left out only when
  // the parent leaves it out too (both run at the default).
  const velocity = { max_mints: scale(v.max, dice.tighten), window_s: v.windowS * (1 + dice.mode) };
  const velocityRules = r.velocity === undefined && dice.mode === 0 ? {} : { velocity };
  return {
    ...PARENT,
    id: "mnd_childC0001",
    rules: {
      budget: budgetOf(Math.floor(room * dice.budget)),
      categories,
      merchants,
      seller_check: r.seller_check.require_capture
        ? { require_capture: true, max_capture_age_s: scale(ageOf(r), dice.tighten) }
        : { require_capture: dice.mode === 1 },
      ...(perPurchase === undefined ? {} : { per_purchase: perPurchase }),
      ...velocityRules,
    },
    valid_until: iso(Math.max(T0 + 1_000, Math.floor(T0 + (until - T0) * dice.days))),
  };
}

const ok = (parent: Mandate, child: Mandate, allocated = 0) => checkChildWithinParent({ parent, child, allocatedMinor: allocated, now: NOW });

describe("a child that only narrows", () => {
  it("is always accepted", () => {
    fc.assert(
      fc.property(parentArb, diceArb, fc.double({ min: 0, max: 1, noNaN: true }), (parent, dice, share) => {
        const allocated = Math.floor(parent.rules.budget.amount_minor * share);
        const child = narrowed(parent, allocated, dice);
        expect(ok(parent, child, allocated)).toEqual({ ok: true });
      }),
      RUNS,
    );
  });

  it("is accepted when it is the parent itself", () => {
    fc.assert(
      fc.property(parentArb, (parent) => {
        expect(ok(parent, { ...parent, id: "mnd_childC0001" })).toEqual({ ok: true });
      }),
      RUNS,
    );
  });
});

/** One widening per field: given a parent and an accepted child, returns a copy with that term widened, or null when it cannot be widened. */
const WIDEN: readonly (readonly [FamilyField, (parent: Mandate, child: Mandate) => Mandate | null])[] = [
  ["budget", (p, c) => ({ ...c, rules: { ...c.rules, budget: budgetOf(p.rules.budget.amount_minor + 1) } })],
  ["valid_until", (p, c) => ({ ...c, valid_until: iso(Date.parse(p.valid_until) + 1_000) })],
  ["categories", (p, c) => {
    const extra = CATEGORIES.find((x) => !p.rules.categories.includes(x));
    return extra === undefined ? null : { ...c, rules: { ...c.rules, categories: [...c.rules.categories, extra] } };
  }],
  ["merchants", (p, c) => {
    const m = p.rules.merchants;
    if (m.allow !== null) return { ...c, rules: { ...c.rules, merchants: { allow: null, deny: m.deny } } };
    return m.deny.length === 0 ? null : { ...c, rules: { ...c.rules, merchants: { allow: null, deny: [] } } };
  }],
  ["seller_check.require_capture", (p, c) => (p.rules.seller_check.require_capture ? { ...c, rules: { ...c.rules, seller_check: { require_capture: false } } } : null)],
  ["seller_check.max_capture_age_s", (p, c) => (p.rules.seller_check.require_capture ? { ...c, rules: { ...c.rules, seller_check: { require_capture: true, max_capture_age_s: ageOf(p.rules) + 1 } } } : null)],
  ["per_purchase.hard_cap_minor", (p, c) => widenTerm(p, c, "hard_cap_minor")],
  ["per_purchase.ask_above_minor", (p, c) => widenTerm(p, c, "ask_above_minor")],
  ["per_purchase.share_of_remaining_bp", (p, c) => widenTerm(p, c, "share_of_remaining_bp")],
  ["velocity", (p, c) => ({ ...c, rules: { ...c.rules, velocity: { max_mints: velocityOf(p.rules).max + 1, window_s: velocityOf(p.rules).windowS } } })],
];

function widenTerm(parent: Mandate, child: Mandate, key: keyof PerPurchase): Mandate | null {
  const limit = parent.rules.per_purchase?.[key];
  if (limit === undefined) return null;
  const { [key]: _dropped, ...rest } = child.rules.per_purchase ?? {};
  const raised = key === "share_of_remaining_bp" && limit >= 10_000 ? null : limit + 1;
  return raised === null ? { ...child, rules: { ...child.rules, per_purchase: rest } } : { ...child, rules: { ...child.rules, per_purchase: { ...rest, [key]: raised } } };
}

describe("widening any single term of an accepted child", () => {
  it.each(WIDEN.map(([field, widen]) => [field, widen] as const))("is refused and names %s", (field, widen) => {
    let widened = 0;
    fc.assert(
      fc.property(parentArb, diceArb, (parent, dice) => {
        const child = narrowed(parent, 0, dice);
        const wide = widen(parent, child);
        fc.pre(wide !== null);
        widened += 1;
        const found = ok(parent, wide as Mandate);
        expect(found.ok).toBe(false);
        if (!found.ok) expect(found.field).toBe(field);
      }),
      RUNS,
    );
    expect(widened).toBeGreaterThan(0);
  });

  it("also when the term is simply left out (per-purchase terms the parent set)", () => {
    fc.assert(
      fc.property(parentArb, diceArb, (parent, dice) => {
        fc.pre(parent.rules.per_purchase !== undefined);
        const child = narrowed(parent, 0, dice);
        const { per_purchase: _gone, ...rules } = child.rules;
        const found = ok(parent, { ...child, rules });
        expect(found.ok).toBe(false);
        if (!found.ok) expect(found.field).toMatch(/^per_purchase\./);
      }),
      RUNS,
    );
  });
});

describe("allocation accumulates", () => {
  it("children are accepted while their budgets fit what is left, and the first that does not fit is refused with the room left", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500_000 }), fc.array(fc.integer({ min: 0, max: 200_000 }), { minLength: 1, maxLength: 8 }), (ceiling, asks) => {
        const parent: Mandate = { ...PARENT, rules: { ...PARENT.rules, budget: budgetOf(ceiling) } };
        let allocated = 0;
        for (const ask of asks) {
          const child: Mandate = { ...PARENT, id: "mnd_childC0001", rules: { ...PARENT.rules, budget: budgetOf(ask) } };
          const found = ok(parent, child, allocated);
          if (allocated + ask <= ceiling) {
            expect(found).toEqual({ ok: true });
            allocated += ask;
          } else {
            expect(found).toMatchObject({ ok: false, field: "budget", requested: ask, allowed: ceiling - allocated });
          }
        }
        expect(allocated).toBeLessThanOrEqual(ceiling);
      }),
      RUNS,
    );
  });
});
