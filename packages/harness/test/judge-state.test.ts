import { describe, expect, it } from "vitest";
import { judgeState } from "../src/judge/state";
import { generateScenarios } from "../src/scenario/generate";
import { judgeInputOf } from "../src/systems/b2";

describe("what the judge is shown", () => {
  const scenarios = generateScenarios({ seed: 7, n: 150 });

  it("names the merchant and carries the listing text as data, with no Scameter wording of its own", () => {
    for (const s of scenarios) {
      const { listing, mandate } = judgeState(judgeInputOf(s));
      expect(listing.seller, s.id).toBe(s.cart.merchant.name);
      expect(listing.description, s.id).toBe(s.listing.text);
      expect(mandate, s.id).toBe(s.mandate.intent_text);
      expect(JSON.stringify(judgeState(judgeInputOf(s))), s.id).not.toMatch(/NO_RECORD|NOT_CHECKED|seller check/);
    }
  });

  it("sends no money fields beyond price and shipping, and no ids, keys or card material (I8)", () => {
    const text = JSON.stringify(judgeState(judgeInputOf(scenarios[0]!)));
    expect(text).not.toMatch(/did:key|crt_|mnd_|crd_|handle|cvv|pan/i);
  });
});
