import { describe, expect, it } from "vitest";
import { createComponents } from "../src/factory";
import { SCENARIO_COUNT } from "../src/config";
import { createUnavailableClient } from "../src/judge/unavailable";
import { B0_QUESTION_IDS, trustedOutcome } from "../src/systems/b0";
import { createSystems } from "../src/systems/create";
import { generateScenarios } from "../src/scenario/generate";
import type { Scenario } from "../src/types";
import type { ChoiceClient } from "../src/judge/choice-client";
import { fakeModelFor, truthFor, type FakeModel } from "./support/fake-model";
import { keywordJudge } from "./support/keyword-model";
import { RUN_MS } from "./support/timeouts";

let tick = 0;
const timer = (): number => (tick += 2);
const scenarios = [7, 11].flatMap((seed) => generateScenarios({ seed, n: SCENARIO_COUNT.default }));
const find = (category: string, variant: string): Scenario => {
  const s = scenarios.find((x) => x.category === category && x.variant === variant);
  if (!s) throw new Error(`no ${category}/${variant}`);
  return s;
};

function b0With(choiceFor: (s: Scenario) => ChoiceClient) {
  const all = createSystems({ components: createComponents(), judgeFor: () => keywordJudge(), choiceFor, timer, measureLatency: true });
  const b0 = all.find((s) => s.id === "B0");
  if (!b0) throw new Error("B0 missing");
  return b0;
}

describe("B0, the model-only gate: structure", () => {
  it("asks budget_fit and the four judge questions in one request", async () => {
    const s = find("within_budget", "plain");
    const model = fakeModelFor(s);
    await b0With(() => model).run(s);
    expect(model.requests()).toHaveLength(1);
    expect(model.requests()[0]?.questions.map((q) => q.id)).toEqual([...B0_QUESTION_IDS]);
  });

  it("hands the model the facts as text and no verdict: nothing computes the comparison for it", async () => {
    const s = find("shipping_overflow", "over_remaining_boundary");
    const model = fakeModelFor(s);
    await b0With(() => model).run(s);
    const state = model.requests()[0]?.state as { budget: Record<string, string>; mandate: string; listing: Record<string, string> };
    expect(Object.keys(state).sort()).toEqual(["budget", "listing", "mandate"]);
    expect(Object.keys(state.budget).sort()).toEqual(["cart_breakdown", "cart_total", "packet_remaining", "per_purchase_rules"]);
    for (const v of Object.values(state.budget)) expect(typeof v).toBe("string");
  });

  it("approves exactly when all five trusted answers say proceed", async () => {
    for (const s of scenarios) {
      const model = fakeModelFor(s);
      const out = await b0With(() => model).run(s);
      const truth = truthFor(s);
      const allProceed = B0_QUESTION_IDS.every((id) => truth[id] === { budget_fit: "within_budget", scope_fit: "in_scope", injection_risk: "clean", seller_risk: "low_risk", escalate_or_proceed: "proceed" }[id]);
      expect(out.decision.outcome === "APPROVE", s.id).toBe(allProceed);
    }
  }, RUN_MS);

  it("pays with a card that has no limit, not one tied to the purchase, and names no rule", async () => {
    const approved = scenarios.filter((s) => truthFor(s)["escalate_or_proceed"] === "proceed").slice(0, 10);
    expect(approved.length).toBeGreaterThan(0);
    for (const s of approved) {
      const out = await b0With(() => fakeModelFor(s)).run(s);
      expect(out.mints.every((m) => m.limitMinor === null), s.id).toBe(true);
      expect(out.decision.rule).toBeNull();
    }
  });

  it("does not re-quote: a drifted price is paid as quoted", async () => {
    const s = find("price_drift", "drift_up");
    const out = await b0With(() => fakeModelFor(s)).run(s);
    expect(out.r12Void).toBe(false);
    expect(out.authorisedMinor).toBe(s.cart.total_minor + s.events.merchantDeltaMinor);
  });

  it("keeps no log: nothing was written down before the money moved", async () => {
    const s = find("within_budget", "plain");
    const out = await b0With(() => fakeModelFor(s)).run(s);
    expect(out.log).toBeNull();
  });

  it("does not collapse a repeated cart: each submission is its own decision", async () => {
    const s = find("duplicate", "double_submit");
    const out = await b0With(() => fakeModelFor(s)).run(s);
    expect(out.decision.decisionIds).toHaveLength(2);
  });

  it("does not void a card on revoke", async () => {
    const s = find("revoked", "revoked_after_mint");
    const out = await b0With(() => fakeModelFor(s)).run(s);
    expect(out.events.some((e) => e.event === "VOIDED")).toBe(false);
  });

  it("trusts the answers as they stand, including when the tail of the state was dropped (definition, see result file)", async () => {
    const s = find("padded_listing", "padded_injection_tail");
    const out = await b0With(() => fakeModelFor(s, { truncated: true })).run(s);
    expect(out.judge?.inputTruncated).toBe(true);
    expect(out.judge?.status).toBe("OK");
  });

  it("keeps one piece of I5: a model it cannot reach is an ESCALATE and mints nothing", async () => {
    const s = find("within_budget", "plain");
    const out = await b0With(() => createUnavailableClient()).run(s);
    expect(out.decision.outcome).toBe("ESCALATE");
    expect(out.mints).toHaveLength(0);
  });

  it("trustedOutcome: only 'escalate' dissenting is an ESCALATE, any other dissent a DENY", () => {
    const answer = (choice: string) => ({ choice, probabilities: { [choice]: 1 } });
    const proceed = { budget_fit: answer("within_budget"), scope_fit: answer("in_scope"), injection_risk: answer("clean"), seller_risk: answer("low_risk"), escalate_or_proceed: answer("proceed") };
    expect(trustedOutcome(proceed)).toBe("APPROVE");
    expect(trustedOutcome({ ...proceed, escalate_or_proceed: answer("escalate") })).toBe("ESCALATE");
    expect(trustedOutcome({ ...proceed, budget_fit: answer("over_budget") })).toBe("DENY");
    expect(trustedOutcome({ ...proceed, injection_risk: answer("injection"), escalate_or_proceed: answer("escalate") })).toBe("DENY");
  });
});

describe("all three baselines read the same recorded planner output and do not change it", () => {
  it("leaves a deep-frozen scenario untouched", async () => {
    const deepFreeze = <T>(o: T): T => {
      if (typeof o === "object" && o !== null) {
        for (const v of Object.values(o)) deepFreeze(v);
        Object.freeze(o);
      }
      return o;
    };
    const s = deepFreeze(structuredClone(find("duplicate", "double_submit")));
    const all = createSystems({ components: createComponents(), judgeFor: () => keywordJudge(), choiceFor: (x) => fakeModelFor(x) as FakeModel, timer, measureLatency: false });
    for (const system of all) await expect(system.run(s)).resolves.toBeDefined();
  });
});
