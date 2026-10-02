import { describe, expect, it } from "vitest";
import { generateScenarios } from "../src/scenario/generate";
import { assertScenarioValid } from "../src/scenario/validate";

describe("scenarios are validated against the core schemas as they are generated", () => {
  const good = generateScenarios({ seed: 7, n: 1 })[0]!;

  it("accepts a generated scenario", () => {
    expect(() => assertScenarioValid(good)).not.toThrow();
  });

  it("rejects a broken cart and names the scenario and the field", () => {
    const broken = { ...good, cart: { ...good.cart, total_minor: -5 } };
    expect(() => assertScenarioValid(broken)).toThrow(new RegExp(`${good.id}.*cart`));
  });

  it("rejects a mandate with a duplicate allow-list entry", () => {
    const dup = { ...good, mandate: { ...good.mandate, rules: { ...good.mandate.rules, merchants: { allow: ["a.example", "a.example"], deny: [] } } } };
    expect(() => assertScenarioValid(dup)).toThrow(/mandate/);
  });

  it("no seed in a wide sweep produces an invalid scenario", () => {
    for (let seed = 0; seed < 40; seed += 1) expect(() => generateScenarios({ seed, n: 36 }), `seed ${seed}`).not.toThrow();
  });
});
