// The line under "Demo scenarios": the cards use the demo shop's clothes, so a budget that leaves clothes out says the rules may stop them.
import { describe, expect, it } from "vitest";
import { OB } from "../src/i18n/onboarding";
import { demoLeadFor } from "../src/screens/home/demoLead";

describe("demoLeadFor", () => {
  it("keeps the usual line for a budget that names clothes", () => {
    expect(demoLeadFor(["apparel"], false)).toBe(OB.home.demoLead);
    expect(demoLeadFor(["groceries", "apparel", "electronics"], false)).toBe(OB.home.demoLead);
  });

  it("keeps the personal line for someone who narrowed what they shop for, when clothes are in the budget", () => {
    expect(demoLeadFor(["apparel"], true)).toBe(OB.home.tryLead);
  });

  it("says the rules may stop the cards when the budget leaves clothes out, whoever is looking", () => {
    expect(demoLeadFor(["groceries"], false)).toBe(OB.home.demoLeadOutside);
    expect(demoLeadFor(["groceries"], true)).toBe(OB.home.demoLeadOutside);
    expect(demoLeadFor([], false)).toBe(OB.home.demoLeadOutside);
  });

  it("is written in both languages and promises nothing it cannot keep", () => {
    expect(OB.home.demoLeadOutside.en).toMatch(/clothes/i);
    expect(OB.home.demoLeadOutside.en).toMatch(/may stop/i);
    expect(OB.home.demoLeadOutside.zh.length).toBeGreaterThan(5);
  });
});
