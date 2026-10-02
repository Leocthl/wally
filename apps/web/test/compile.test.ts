// Sentence -> rule chips -> rules (docs/01 Example mandates M0, M1, M2). The chips are the enforced rules; the sentence is display.
import { validateMandate } from "@laisee/core/schema";
import { describe, expect, it } from "vitest";
import { compileMandate, chipsToRules, M0_SENTENCE, m0Request, validUntilFor } from "../src/booth/compile";
import { M0_CREDENTIAL } from "../src/api/mock/fixtures";

const NOW = new Date("2026-10-03T02:00:00Z");

describe("compileMandate", () => {
  it("compiles M0 into the fixture's rules: HK$800, clothes, verified sellers, expiry at month end [F20]", () => {
    const { chips, issues } = compileMandate(M0_SENTENCE, NOW);
    expect(issues).toEqual([]);
    expect(chips.map((c) => c.kind)).toEqual(["budget", "expiry", "category", "sellers"]);
    expect(chipsToRules(chips)).toEqual(M0_CREDENTIAL.credentialSubject.rules);
    expect(validUntilFor(chips, NOW)).toBe("2026-10-31T15:59:59Z");
  });

  it("M0 request seals the same rules the credential fixture carries", () => {
    const req = m0Request(NOW);
    expect(req.rules).toEqual(M0_CREDENTIAL.credentialSubject.rules);
    expect(req.intentText).toBe(M0_SENTENCE);
    expect(req.validUntil).toBe("2026-10-31T15:59:59Z");
  });

  it("compiles M1: an adaptive cap of half of what is left [F90]", () => {
    const { chips } = compileMandate("HK$800 this month for clothes, verified sellers only, no single purchase above half of what is left", NOW);
    expect(chips.map((c) => c.kind)).toContain("share");
    expect(chipsToRules(chips).per_purchase).toEqual({ share_of_remaining_bp: 5000 });
  });

  it("compiles M2: seven days from seal, ask above HK$300 [F90]", () => {
    const { chips } = compileMandate("HK$800 for clothes over the next 7 days, verified sellers only; ask me above HK$300", NOW);
    const rules = chipsToRules(chips);
    expect(rules.budget.amount_minor).toBe(80_000);
    expect(rules.per_purchase).toEqual({ ask_above_minor: 30_000 });
    expect(validUntilFor(chips, NOW)).toBe("2026-10-10T02:00:00Z");
  });

  it("produces rules that pass the mandate schema", () => {
    const { chips } = compileMandate("HK$500 this month for shoes and clothes, any seller", NOW);
    const rules = chipsToRules(chips);
    expect(rules.seller_check.require_capture).toBe(false);
    expect(validateMandate({ id: "mnd_test01", delegator: M0_CREDENTIAL.issuer, agent: M0_CREDENTIAL.credentialSubject.id, intent_text: "x", rules, valid_from: "2026-10-03T02:00:00Z", valid_until: "2026-10-31T15:59:59Z" }).ok).toBe(true);
  });

  it("marks a missing amount invalid so Seal stays disabled", () => {
    const { chips, issues } = compileMandate("buy me some clothes", NOW);
    expect(chips.find((c) => c.kind === "budget")?.valid).toBe(false);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("marks an unknown category invalid", () => {
    const { chips } = compileMandate("HK$800 this month for spaceships", NOW);
    expect(chips.find((c) => c.kind === "category")?.valid).toBe(false);
  });

  it("defaults to verified sellers only when the sentence says nothing (fail closed)", () => {
    const { chips } = compileMandate("HK$800 this month for clothes", NOW);
    expect(chipsToRules(chips).seller_check.require_capture).toBe(true);
  });

  it("treats an amount with no digits after HK$ as no amount", () => {
    expect(compileMandate("HK$ for clothes", NOW).chips.find((c) => c.kind === "budget")?.valid).toBe(false);
  });
});
