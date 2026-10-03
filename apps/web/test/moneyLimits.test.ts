// A typed amount can be absurdly large (16 digits): it must never reach the formatter, which refuses a number that is not a safe
// integer of minor units (the page used to fall over, and the first run started again with the ready-made HK$800). Money text
// that cannot be held is "not an amount" at the edge; the first budget cuts a too-large typed amount to one card's limit [F1] and says so.
import { describe, expect, it } from "vitest";
import { compileMandate } from "../src/booth/compile";
import { dollarsToMinor } from "../src/domain/money";
import { BUDGET_CEILING_MINOR, capAmount, draftFor, formOf } from "../src/screens/onboarding/budgetModel";
import { applySentence, EMPTY_FORM, isValid, moneyOf, validate, type RulesForm } from "../src/screens/seal/sealModel";

const NOW = new Date("2026-10-03T02:00:00Z");
const HUGE = "9007199254740993";
const form = (over: Partial<RulesForm> = {}): RulesForm => ({ ...EMPTY_FORM(NOW), amount: "800", categories: ["apparel"], ...over });

describe("money text the app cannot hold", () => {
  it("is not an amount: a number past the safe integers of minor units reads as null", () => {
    expect(dollarsToMinor(HUGE)).toBeNull();
    expect(dollarsToMinor("90071992547409")).toBe(9_007_199_254_740_900);
    expect(dollarsToMinor("800")).toBe(80_000);
    expect(dollarsToMinor("0.5")).toBe(50);
    expect(moneyOf("HK$ 9,007,199,254,740,993")).toBeNull();
  });

  it("says too large on the field, not 'digits only' (the digits are fine), and keeps Seal out of reach", () => {
    const errors = validate(form({ amount: HUGE }), NOW);
    expect(errors.amount).toBe("seal.errTooBig");
    expect(isValid(errors)).toBe(false);
    expect(validate(form({ amount: "12abc" }), NOW).amount).toBe("seal.errFormat");
    expect(validate(form({ amount: "800" }), NOW).amount).toBeUndefined();
  });

  it("reads no amount from a sentence that names one, so typing it into the Seal sentence cannot crash", () => {
    expect(() => applySentence(EMPTY_FORM(NOW), `HK$${HUGE} for clothes`, NOW)).not.toThrow();
    expect(applySentence(EMPTY_FORM(NOW), `HK$${HUGE} for clothes`, NOW).complete).toBe(false);
    expect(compileMandate(`HK$${HUGE} for clothes`, NOW).issues.length).toBeGreaterThan(0);
  });
});

describe("the first budget's typed amount is cut to one card's limit", () => {
  it("keeps HK$2,000 [F1] as the most", () => {
    expect(BUDGET_CEILING_MINOR).toBe(200_000);
  });

  it("cuts what is above it, whatever the size, and says it was cut", () => {
    for (const text of [HUGE, "2000.01", "2001", "5000", "HK$ 2,500", "99999999999999999999999"]) {
      expect(capAmount(text), text).toEqual({ text: "2000", capped: true });
    }
  });

  it("leaves what fits, and what is not an amount (the field's own message says what is wrong)", () => {
    for (const text of ["2000", "1999.99", "800", "0.5", "", "  ", "abc", "12abc", "-5"]) {
      expect(capAmount(text), text).toEqual({ text, capped: false });
    }
  });

  it("is what the form carries to Check and lock in, for a typed amount only", () => {
    const draft = { ...draftFor(null, NOW), amount: "custom" as const, custom: HUGE };
    expect(formOf(draft, NOW).amount).toBe("2000");
    expect(formOf({ ...draft, custom: "650" }, NOW).amount).toBe("650");
    expect(formOf({ ...draft, amount: 800 }, NOW).amount).toBe("800");
  });
});
