import { describe, expect, it } from "vitest";
import { budgetFacts, listingState } from "../src/judge/state";
import { generateScenarios } from "../src/scenario/generate";
import { judgeInputOf } from "../src/systems/b2";

describe("what B0's model is shown", () => {
  const scenarios = generateScenarios({ seed: 7, n: 150 });

  it("names the merchant and carries the listing text as data, with no Scameter wording of its own", () => {
    for (const s of scenarios) {
      const listing = listingState(s.cart, s.listing.text);
      expect(listing.seller, s.id).toBe(s.cart.merchant.name);
      expect(listing.description, s.id).toBe(s.listing.text);
      expect(JSON.stringify(listing), s.id).not.toMatch(/NO_RECORD|NOT_CHECKED|seller check/);
    }
  });

  it("states the budget as text and does no arithmetic: the cap of a share rule is the share, not a sum", () => {
    const withShare = scenarios.find((s) => s.mandate.rules.per_purchase?.share_of_remaining_bp !== undefined);
    if (withShare === undefined) throw new Error("no adaptive-cap scenario in seed 7");
    const facts = budgetFacts(withShare.mandate, withShare.packet, withShare.cart);
    expect(facts.per_purchase_rules).toMatch(/% of the money left/);
    const cap = Math.floor(((withShare.mandate.rules.per_purchase?.share_of_remaining_bp ?? 0) * withShare.packet.remaining_minor) / 10_000);
    expect(JSON.stringify(facts)).not.toContain(`HK$${(cap / 100).toFixed(2)}`); // the model has to work the cap out itself
  });

  it("sends no ids, keys or card material (I8)", () => {
    for (const s of scenarios.slice(0, 40)) {
      const text = JSON.stringify({ listing: listingState(s.cart, s.listing.text), budget: budgetFacts(s.mandate, s.packet, s.cart) });
      expect(text, s.id).not.toMatch(/did:key|crt_|mnd_|crd_|handle|cvv|pan/i);
    }
  });
});

describe("what B2 gives the judge", () => {
  const scenarios = generateScenarios({ seed: 7, n: 60 });

  it("is a function of the scenario: intent, rules, cart, listing text and the Scameter record, and nothing else", () => {
    for (const s of scenarios) {
      const input = judgeInputOf(s);
      expect(Object.keys(input).sort(), s.id).toEqual(["cart", "intentText", "listingText", "rules", "scameter"]);
      expect(input.intentText).toBe(s.mandate.intent_text);
      expect(input.listingText).toBe(s.listing.text);
      expect(input.cart).toBe(s.cart);
    }
  });

  it("carries no card material (I8)", () => {
    for (const s of scenarios) expect(JSON.stringify(judgeInputOf(s)), s.id).not.toMatch(/"handle"|cvv|"pan"|last4/i);
  });
});
