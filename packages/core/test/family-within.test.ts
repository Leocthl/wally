// checkChildWithinParent, one rule at a time: the child may narrow the parent's rules and never widen them.
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/config";
import { checkChildWithinParent, hkd, type FamilyCheck } from "../src/family";
import type { Mandate } from "../src/generated";
import { NOW, PARENT, PARENT_UNTIL, budgetOf, childWith, mandateWith } from "./family-helpers";

const check = (child: Mandate, opts: { parent?: Mandate; allocatedMinor?: number; now?: Date } = {}): FamilyCheck =>
  checkChildWithinParent({ parent: opts.parent ?? PARENT, child, allocatedMinor: opts.allocatedMinor ?? 0, now: opts.now ?? NOW });

describe("hkd", () => {
  it("writes integer minor units as HK$ with separators", () => {
    expect([0, 5, 100, 100_000, 150_000, 123_456_789, 100_050].map(hkd)).toEqual(["HK$0", "HK$0.05", "HK$1", "HK$1,000", "HK$1,500", "HK$1,234,567.89", "HK$1,000.50"]);
  });
});

describe("budget", () => {
  it("accepts the parent's own ceiling and anything below it", () => {
    expect(check(childWith({ rules: { budget: budgetOf(100_000) } }))).toEqual({ ok: true });
    expect(check(childWith({ rules: { budget: budgetOf(80_000) } }))).toEqual({ ok: true });
    expect(check(childWith({ rules: { budget: budgetOf(0) } }))).toEqual({ ok: true });
  });

  it("refuses HK$1,500 under HK$1,000 with the two amounts and a sentence that names both", () => {
    const found = check(childWith({ rules: { budget: budgetOf(150_000) } }));
    expect(found).toMatchObject({ ok: false, field: "budget", requested: 150_000, allowed: 100_000 });
    expect(found.ok ? "" : found.message).toContain("HK$1,500");
    expect(found.ok ? "" : found.message).toContain("HK$1,000");
  });

  it("takes what earlier children were given off the ceiling (allocation accumulates)", () => {
    expect(check(childWith({ rules: { budget: budgetOf(20_000) } }), { allocatedMinor: 80_000 })).toEqual({ ok: true });
    expect(check(childWith({ rules: { budget: budgetOf(20_001) } }), { allocatedMinor: 80_000 })).toMatchObject({ ok: false, field: "budget", requested: 20_001, allowed: 20_000 });
  });

  it("allows nothing once the ceiling is fully given out, and never a negative allowance", () => {
    expect(check(childWith({ rules: { budget: budgetOf(1) } }), { allocatedMinor: 100_000 })).toMatchObject({ ok: false, field: "budget", allowed: 0 });
    expect(check(childWith({ rules: { budget: budgetOf(1) } }), { allocatedMinor: 130_000 })).toMatchObject({ ok: false, field: "budget", allowed: 0 });
  });

  it("fails closed on an allocation that is not a whole, non-negative number of minor units", () => {
    for (const bad of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(check(childWith({ rules: { budget: budgetOf(1) } }), { allocatedMinor: bad }), String(bad)).toMatchObject({ ok: false, field: "budget", allowed: 0 });
    }
  });
});

describe("dates", () => {
  it("accepts an end on or before the parent's, refuses one after", () => {
    expect(check(childWith({ valid_until: PARENT_UNTIL }))).toEqual({ ok: true });
    expect(check(childWith({ valid_until: "2026-10-15T00:00:00Z" }))).toEqual({ ok: true });
    expect(check(childWith({ valid_until: "2026-10-31T16:00:00Z" }))).toMatchObject({ ok: false, field: "valid_until", requested: "2026-10-31T16:00:00Z", allowed: PARENT_UNTIL });
  });

  it("refuses a parent that has ended (now >= valid_until, as R2) or has not started", () => {
    expect(check(childWith({ valid_until: PARENT_UNTIL }), { now: new Date(PARENT_UNTIL) })).toMatchObject({ ok: false, field: "valid_until" });
    expect(check(childWith(), { now: new Date("2026-10-03T01:58:59Z") })).toMatchObject({ ok: false, field: "valid_from" });
    expect(check(childWith(), { now: new Date("2026-10-03T01:59:00Z") })).toEqual({ ok: true });
  });

  it("fails closed on a date that does not read", () => {
    expect(check(childWith({ valid_until: "tomorrow" }))).toMatchObject({ ok: false, field: "valid_until" });
    expect(check(childWith(), { now: new Date("nope") })).toMatchObject({ ok: false });
  });
});

describe("categories", () => {
  const parent = mandateWith(PARENT, { rules: { categories: ["apparel", "footwear"] } });
  it("accepts a subset and refuses a category the parent did not list", () => {
    expect(check(childWith({ rules: { categories: ["footwear"] } }, parent), { parent })).toEqual({ ok: true });
    const found = check(childWith({ rules: { categories: ["apparel", "electronics"] } }, parent), { parent });
    expect(found).toMatchObject({ ok: false, field: "categories", requested: ["apparel", "electronics"], allowed: ["apparel", "footwear"] });
    expect(found.ok ? "" : found.message).toContain("electronics");
  });
});

describe("merchants", () => {
  const only = (allow: string[] | null, deny: string[] = []) => ({ merchants: { allow, deny } });
  const parentAllow = mandateWith(PARENT, { rules: only(["a.example", "b.example"], ["b.example"]) });
  const parentDeny = mandateWith(PARENT, { rules: only(null, ["bad.example"]) });

  it("a parent with no merchant limits lets the child choose any", () => {
    expect(check(childWith({ rules: only(null) }))).toEqual({ ok: true });
    expect(check(childWith({ rules: only(["a.example"], ["x.example"]) }))).toEqual({ ok: true });
  });

  it("a child must stay inside the parent's allow list, and keep its denials", () => {
    expect(check(childWith({ rules: only(["a.example"]) }, parentAllow), { parent: parentAllow })).toEqual({ ok: true });
    expect(check(childWith({ rules: only(["a.example", "b.example"], ["b.example"]) }, parentAllow), { parent: parentAllow })).toEqual({ ok: true });
    expect(check(childWith({ rules: only(null) }, parentAllow), { parent: parentAllow })).toMatchObject({ ok: false, field: "merchants" });
    expect(check(childWith({ rules: only(["a.example", "c.example"]) }, parentAllow), { parent: parentAllow })).toMatchObject({ ok: false, field: "merchants" });
    expect(check(childWith({ rules: only(["a.example", "b.example"]) }, parentAllow), { parent: parentAllow })).toMatchObject({ ok: false, field: "merchants" });
  });

  it("a parent's denial must stay: an open child needs the same denial or a wider one, and a deny covers subdomains", () => {
    expect(check(childWith({ rules: only(null, ["bad.example"]) }, parentDeny), { parent: parentDeny })).toEqual({ ok: true });
    expect(check(childWith({ rules: only(null, ["example.bad.example", "bad.example"]) }, parentDeny), { parent: parentDeny })).toEqual({ ok: true });
    expect(check(childWith({ rules: only(null) }, parentDeny), { parent: parentDeny })).toMatchObject({ ok: false, field: "merchants" });
    expect(check(childWith({ rules: only(null, ["sub.bad.example"]) }, parentDeny), { parent: parentDeny })).toMatchObject({ ok: false, field: "merchants" });
    expect(check(childWith({ rules: only(["good.example"]) }, parentDeny), { parent: parentDeny })).toEqual({ ok: true });
    expect(check(childWith({ rules: only(["bad.example"]) }, parentDeny), { parent: parentDeny })).toMatchObject({ ok: false, field: "merchants" });
  });
});

describe("seller check", () => {
  it("a parent that requires verified sellers makes the child require them", () => {
    expect(check(childWith({ rules: { seller_check: { require_capture: false } } }))).toMatchObject({ ok: false, field: "seller_check.require_capture", requested: false, allowed: true });
    expect(check(childWith({ rules: { seller_check: { require_capture: true } } }))).toEqual({ ok: true });
  });

  it("a parent that does not require them leaves the child free", () => {
    const loose = mandateWith(PARENT, { rules: { seller_check: { require_capture: false } } });
    expect(check(childWith({ rules: { seller_check: { require_capture: false } } }, loose), { parent: loose })).toEqual({ ok: true });
    expect(check(childWith({ rules: { seller_check: { require_capture: true } } }, loose), { parent: loose })).toEqual({ ok: true });
  });

  it("the child's captures may not be older than the parent's, defaults counted", () => {
    const strict = mandateWith(PARENT, { rules: { seller_check: { require_capture: true, max_capture_age_s: 3_600 } } });
    expect(check(childWith({ rules: { seller_check: { require_capture: true, max_capture_age_s: 600 } } }, strict), { parent: strict })).toEqual({ ok: true });
    expect(check(childWith({ rules: { seller_check: { require_capture: true, max_capture_age_s: 3_601 } } }, strict), { parent: strict })).toMatchObject({ ok: false, field: "seller_check.max_capture_age_s", requested: 3_601, allowed: 3_600 });
    expect(check(childWith({ rules: { seller_check: { require_capture: true } } }, strict), { parent: strict })).toMatchObject({ ok: false, field: "seller_check.max_capture_age_s", requested: ENGINE_CONFIG.seller.max_capture_age_s, allowed: 3_600 });
  });
});

describe("per purchase", () => {
  const capped = mandateWith(PARENT, { rules: { per_purchase: { hard_cap_minor: 30_000, ask_above_minor: 20_000, share_of_remaining_bp: 5_000 } } });
  const within = { hard_cap_minor: 30_000, ask_above_minor: 20_000, share_of_remaining_bp: 5_000 };

  it("accepts the same terms, tighter terms and extra terms", () => {
    expect(check(childWith({ rules: { per_purchase: within } }, capped), { parent: capped })).toEqual({ ok: true });
    expect(check(childWith({ rules: { per_purchase: { hard_cap_minor: 10_000, ask_above_minor: 5_000, share_of_remaining_bp: 2_500 } } }, capped), { parent: capped })).toEqual({ ok: true });
    expect(check(childWith({ rules: { per_purchase: { hard_cap_minor: 10_000 } } }))).toEqual({ ok: true }); // the parent set none
  });

  it.each([
    ["per_purchase.hard_cap_minor", { ...within, hard_cap_minor: 30_001 }, 30_001, 30_000],
    ["per_purchase.ask_above_minor", { ...within, ask_above_minor: 20_001 }, 20_001, 20_000],
    ["per_purchase.share_of_remaining_bp", { ...within, share_of_remaining_bp: 5_001 }, 5_001, 5_000],
  ] as const)("refuses a looser %s", (field, per_purchase, requested, allowed) => {
    expect(check(childWith({ rules: { per_purchase } }, capped), { parent: capped })).toMatchObject({ ok: false, field, requested, allowed });
  });

  it.each([
    ["per_purchase.hard_cap_minor", { ask_above_minor: 20_000, share_of_remaining_bp: 5_000 }],
    ["per_purchase.ask_above_minor", { hard_cap_minor: 30_000, share_of_remaining_bp: 5_000 }],
    ["per_purchase.share_of_remaining_bp", { hard_cap_minor: 30_000, ask_above_minor: 20_000 }],
  ] as const)("refuses a child that leaves out a term the parent set (%s)", (field, per_purchase) => {
    expect(check(childWith({ rules: { per_purchase } }, capped), { parent: capped })).toMatchObject({ ok: false, field, requested: "not set" });
  });

  it("refuses a child with no per-purchase rules at all under a parent that has them", () => {
    const bare = childWith({}, capped);
    const { per_purchase: _gone, ...rules } = bare.rules;
    expect(check({ ...bare, rules }, { parent: capped })).toMatchObject({ ok: false, field: "per_purchase.hard_cap_minor" });
  });
});

describe("velocity", () => {
  const velocity = (max_mints: number, window_s: number) => ({ velocity: { max_mints, window_s } });
  const parent = mandateWith(PARENT, { rules: velocity(2, 600) });

  it("accepts the same, fewer, or the same count over a longer window", () => {
    expect(check(childWith({ rules: velocity(2, 600) }, parent), { parent })).toEqual({ ok: true });
    expect(check(childWith({ rules: velocity(1, 600) }, parent), { parent })).toEqual({ ok: true });
    expect(check(childWith({ rules: velocity(2, 1_200) }, parent), { parent })).toEqual({ ok: true });
  });

  it("refuses more purchases, or the same count in a shorter window (two bursts fit in the parent's window); half the count in half the window is fine", () => {
    expect(check(childWith({ rules: velocity(3, 600) }, parent), { parent })).toMatchObject({ ok: false, field: "velocity", requested: "3 per 600 s", allowed: "2 per 600 s" });
    expect(check(childWith({ rules: velocity(2, 300) }, parent), { parent })).toMatchObject({ ok: false, field: "velocity" });
    expect(check(childWith({ rules: velocity(1, 300) }, parent), { parent })).toEqual({ ok: true });
  });

  it("counts the engine default on a side that sets none", () => {
    const { velocity: _v, ...bareRules } = PARENT.rules;
    const noVelocity = (m: Mandate): Mandate => ({ ...m, rules: bareRules });
    expect(check(noVelocity(childWith()))).toEqual({ ok: true }); // default against default
    expect(check(childWith({ rules: velocity(ENGINE_CONFIG.velocity.max_mints + 1, ENGINE_CONFIG.velocity.window_s) }))).toMatchObject({ ok: false, field: "velocity" });
    expect(check(noVelocity(childWith({}, parent)), { parent })).toMatchObject({ ok: false, field: "velocity" }); // the default is looser than 2 per 600
  });
});

describe("order and shape", () => {
  it("reports the first widening in a fixed order: dates, budget, categories, merchants, sellers, per purchase, velocity", () => {
    const wide = childWith({ valid_until: "2027-01-01T00:00:00Z", rules: { budget: budgetOf(900_000), categories: ["apparel", "electronics"], seller_check: { require_capture: false } } });
    expect(check(wide)).toMatchObject({ field: "valid_until" });
    expect(check({ ...wide, valid_until: PARENT_UNTIL })).toMatchObject({ field: "budget" });
    expect(check({ ...wide, valid_until: PARENT_UNTIL, rules: { ...wide.rules, budget: budgetOf(1) } })).toMatchObject({ field: "categories" });
  });

  it("does not change its inputs", () => {
    const parent = structuredClone(PARENT);
    const child = childWith({ rules: { budget: budgetOf(150_000) } });
    const before = structuredClone(child);
    check(child, { parent });
    expect(parent).toEqual(PARENT);
    expect(child).toEqual(before);
  });
});
