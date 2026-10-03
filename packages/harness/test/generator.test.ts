import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  validateCart,
  validateListingRecord,
  validateMandate,
  validatePacketState,
  validatePlannerReplayRecord,
  validateScameterCapture,
} from "@wally/core/schema";
import { CATEGORIES, JUDGE_DEPENDENT, SCENARIO_COUNT, SLOTS } from "../src/config";
import { generateScenarios } from "../src/scenario/generate";
import type { Scenario } from "../src/types";

const SEEDS = [7, 11, 2026] as const;
const DEFAULT_N = SCENARIO_COUNT.default;

function byCategory(scenarios: readonly Scenario[]): Map<string, Scenario[]> {
  return scenarios.reduce((acc, s) => acc.set(s.category, [...(acc.get(s.category) ?? []), s]), new Map<string, Scenario[]>());
}

describe("generator: seeded and deterministic", () => {
  it("returns exactly n scenarios and the same ones for the same seed", () => {
    const a = generateScenarios({ seed: 7, n: DEFAULT_N });
    const b = generateScenarios({ seed: 7, n: DEFAULT_N });
    expect(a).toHaveLength(DEFAULT_N);
    expect(b).toEqual(a);
  });

  it("changes with the seed", () => {
    expect(generateScenarios({ seed: 7, n: 40 })).not.toEqual(generateScenarios({ seed: 8, n: 40 }));
  });

  it("a smaller run is a prefix of a larger one (scenario i depends on seed and i only)", () => {
    const small = generateScenarios({ seed: 7, n: SCENARIO_COUNT.minimum });
    const large = generateScenarios({ seed: 7, n: DEFAULT_N });
    expect(large.slice(0, SCENARIO_COUNT.minimum)).toEqual(small);
  });

  it("rejects an n that is not a positive integer", () => {
    expect(() => generateScenarios({ seed: 7, n: 0 })).toThrow(RangeError);
    expect(() => generateScenarios({ seed: 7, n: 2.5 })).toThrow(RangeError);
  });

  it("gives unique, schema-shaped scenario ids", () => {
    const scenarios = generateScenarios({ seed: 7, n: DEFAULT_N });
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
    for (const s of scenarios) expect(s.planner.scenario).toMatch(/^[a-z0-9][a-z0-9_-]{1,40}$/);
  });
});

describe.each(SEEDS)("generator coverage, seed %i", (seed) => {
  const scenarios = generateScenarios({ seed, n: DEFAULT_N });
  const groups = byCategory(scenarios);

  it("covers every category named in docs/05", () => {
    expect([...groups.keys()].sort()).toEqual([...CATEGORIES].sort());
  });

  it("follows the slot plan, so category counts differ by at most the slot multiplicity", () => {
    for (const category of CATEGORIES) {
      const slots = SLOTS.filter((c) => c === category).length;
      const expected = Math.floor(DEFAULT_N / SLOTS.length) * slots;
      const got = groups.get(category)?.length ?? 0;
      expect(got).toBeGreaterThanOrEqual(expected);
      expect(got).toBeLessThanOrEqual(expected + slots);
    }
  });

  it("gives every category legitimate controls, and every category except within_budget stop cases", () => {
    for (const category of CATEGORIES) {
      const members = groups.get(category) ?? [];
      expect(members.some((s) => s.label.legitimate), `${category} has no legitimate control`).toBe(true);
      if (category !== "within_budget") {
        expect(members.some((s) => !s.label.legitimate), `${category} has no stop case`).toBe(true);
      }
    }
  });

  it("labels every scenario: a legitimate one is approved, a stop cites a rule", () => {
    for (const s of scenarios) {
      const { label } = s;
      if (label.legitimate) expect(label.decision, s.id).toBe("APPROVE");
      if (label.decision !== "APPROVE") {
        expect(label.rule, s.id).not.toBeNull();
        expect(label.templateId, s.id).not.toBeNull();
        expect(label.payment.kind, s.id).toBe("none");
        expect(label.expectedMints, s.id).toBe(0);
      } else {
        expect(label.expectedMints, s.id).toBe(1);
      }
    }
  });

  it("classes categories as docs/05 does: deterministic ones never carry judge-dependent labels", () => {
    for (const s of scenarios) {
      if (!JUDGE_DEPENDENT.has(s.category)) expect(s.label.class, s.id).toBe("deterministic");
    }
    for (const category of JUDGE_DEPENDENT) {
      expect((groups.get(category) ?? []).some((s) => s.label.class === "judge_dependent"), category).toBe(true);
    }
  });

  it("only the judge-dependent categories may carry judge-dependent labels, except judge-dependent controls", () => {
    for (const s of scenarios) {
      if (s.label.class === "judge_dependent") expect(["injected_text", "padded_listing", "judge_down"], s.id).toContain(s.category);
    }
  });

  it("builds schema-valid mandates, packets, listings, captures, carts and planner records", () => {
    for (const s of scenarios) {
      expect(validateMandate(s.mandate).ok, `${s.id} mandate`).toBe(true);
      expect(validatePacketState(s.packet).ok, `${s.id} packet`).toBe(true);
      expect(validateListingRecord(s.listing).ok, `${s.id} listing`).toBe(true);
      expect(validateCart(s.cart).ok, `${s.id} cart`).toBe(true);
      expect(validatePlannerReplayRecord(s.planner).ok, `${s.id} planner`).toBe(true);
      if (s.scameterCapture) expect(validateScameterCapture(s.scameterCapture).ok, `${s.id} capture`).toBe(true);
    }
  });

  it("keeps money in integer minor units and the cart arithmetic exact", () => {
    for (const s of scenarios) {
      const { cart } = s;
      const subtotal = cart.items.reduce((acc, i) => acc + i.qty * i.unit_price_minor, 0);
      expect(cart.subtotal_minor, s.id).toBe(subtotal);
      expect(cart.total_minor, s.id).toBe(subtotal + cart.shipping_minor + cart.fees_minor + (cart.fx?.fee_minor ?? 0));
      for (const v of [cart.total_minor, cart.subtotal_minor, cart.shipping_minor, cart.fees_minor, s.limits.allowedMinor]) {
        expect(Number.isInteger(v), `${s.id} ${v}`).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("keeps packet accounting consistent: budget = committed + spent + remaining", () => {
    for (const s of scenarios) {
      const p = s.packet;
      expect(p.committed_minor + p.spent_minor + p.remaining_minor, s.id).toBe(p.budget_minor);
      expect(p.committed_minor, s.id).toBe(p.active_cards.reduce((acc, c) => acc + c.limit_minor, 0));
    }
  });

  it("feeds the planner record into the cart: same listing url, titles from the listing, quantity one", () => {
    for (const s of scenarios) {
      expect(s.planner.proposal, s.id).not.toBeNull();
      const proposal = s.planner.proposal;
      if (!proposal) continue;
      expect(proposal.listing_url, s.id).toBe(s.listing.url);
      expect(s.cart.listing.url, s.id).toBe(s.listing.url);
      for (const item of proposal.items) {
        expect(item.qty, s.id).toBe(1);
        expect(s.listing.items.map((i) => i.title), s.id).toContain(item.title);
      }
      expect(s.planner.listing_ids, s.id).toEqual([s.listing.id]);
    }
  });

  it("marks every record SIMULATED and never names a real merchant", () => {
    for (const s of scenarios) {
      expect(s.provenance).toBe("SIMULATED");
      expect(s.listing.provenance).toBe("SIMULATED");
      expect(s.cart.provenance).toBe("SIMULATED");
      expect(s.cart.merchant.name, s.id).toContain("(SIMULATED)");
      expect(s.cart.merchant.domain, s.id).toMatch(/\.example$/);
    }
  });

  it("prices in HKD only: the cart builder has no FX source, so no cart carries an fx block", () => {
    for (const s of scenarios) {
      expect(s.cart.fx, s.id).toBeNull();
      expect(s.cart.currency, s.id).toBe("HKD");
    }
  });

  it("the fees category states its listing fee in the cart and keeps it in the total", () => {
    const fees = scenarios.filter((s) => s.category === "fees");
    expect(fees.length).toBeGreaterThan(0);
    for (const s of fees) {
      expect(s.cart.fees_minor, s.id).toBeGreaterThan(0);
      expect(s.cart.total_minor, s.id).toBe(s.cart.subtotal_minor + s.cart.shipping_minor + s.cart.fees_minor);
    }
  });

  it("records an injection corpus entry with its split exactly on the injection set", () => {
    const injected = groups.get("injected_text") ?? [];
    expect(injected.length).toBeGreaterThan(0);
    for (const s of injected.filter((x) => !x.label.legitimate)) {
      expect(s.injection, s.id).not.toBeNull();
      expect(["tuning", "heldout"]).toContain(s.injection?.split);
    }
    expect(injected.some((s) => s.injection?.split === "tuning")).toBe(true);
    expect(injected.some((s) => s.injection?.split === "heldout")).toBe(true);
    for (const s of scenarios.filter((x) => x.category !== "injected_text" && x.category !== "padded_listing")) {
      expect(s.injection, s.id).toBeNull();
    }
  });

  it("includes some injection cases that pass every hard rule, so only the judge can stop them", () => {
    const injected = (groups.get("injected_text") ?? []).filter((s) => !s.label.legitimate);
    expect(injected.some((s) => s.injection?.hardRulesAlsoStop === false && s.label.class === "judge_dependent")).toBe(true);
  });

  it("places boundary cases on both sides of a limit", () => {
    const overflow = groups.get("shipping_overflow") ?? [];
    const over = overflow.filter((s) => !s.label.legitimate);
    const under = overflow.filter((s) => s.label.legitimate);
    expect(over.length).toBeGreaterThan(0);
    expect(under.length).toBeGreaterThan(0);
    for (const s of over.filter((x) => x.label.rule === "R3")) {
      expect(s.cart.total_minor, s.id).toBeGreaterThan(s.packet.remaining_minor);
    }
    for (const s of under) expect(s.cart.total_minor, s.id).toBeLessThanOrEqual(s.limits.allowedMinor);
  });
});

describe("generator: varied mandates and clocks", () => {
  const scenarios = generateScenarios({ seed: 7, n: DEFAULT_N });

  it("varies per-purchase caps: none, hard, adaptive, ask_above", () => {
    const shapes = new Set(
      scenarios.map((s) => {
        const p = s.mandate.rules.per_purchase;
        return p === undefined ? "none" : [p.hard_cap_minor !== undefined && "hard", p.share_of_remaining_bp !== undefined && "adaptive", p.ask_above_minor !== undefined && "ask"].filter(Boolean).join("+");
      }),
    );
    expect(shapes.has("none")).toBe(true);
    expect([...shapes].some((x) => x.includes("hard"))).toBe(true);
    expect([...shapes].some((x) => x.includes("adaptive"))).toBe(true);
    expect([...shapes].some((x) => x.includes("ask"))).toBe(true);
  });

  it("varies the decision clock and keeps the mandate window around it, except in expired and revoked cases", () => {
    expect(new Set(scenarios.map((s) => s.now)).size).toBeGreaterThan(DEFAULT_N / 2);
    for (const s of scenarios) {
      const now = Date.parse(s.now);
      const until = Date.parse(s.mandate.valid_until);
      if (s.category === "expired" && !s.label.legitimate) expect(until, s.id).toBeLessThanOrEqual(now);
      else expect(until, s.id).toBeGreaterThan(now);
    }
  });

  it("varies revoke timing", () => {
    const timings = new Set(scenarios.map((s) => s.events.revoke));
    expect(timings.has("none")).toBe(true);
    expect(timings.has("after_mint")).toBe(true);
    expect(scenarios.some((s) => s.packet.status === "REVOKED")).toBe(true);
  });

  it("varies listings by reusing and combining the fixtures", () => {
    const domains = new Set(scenarios.map((s) => s.cart.merchant.domain));
    expect(domains.size).toBeGreaterThanOrEqual(8);
    expect(domains.has("demo-apparel.example")).toBe(true);
  });
});

describe("generator source hygiene", () => {
  const root = fileURLToPath(new URL("../src", import.meta.url));
  const files = (readdirSync(root, { recursive: true, encoding: "utf8" }) as string[]).filter((f) => f.endsWith(".ts"));

  it("never calls Math.random or Date.now, and reads no clock in the generator", () => {
    for (const f of files) {
      const text = readFileSync(join(root, f), "utf8");
      expect(text, f).not.toMatch(/Math\.random\s*\(/);
      expect(text, f).not.toMatch(/Date\.now\s*\(/);
      if (f.startsWith("scenario")) expect(text, f).not.toMatch(/new Date\(\s*\)/);
    }
  });
});
