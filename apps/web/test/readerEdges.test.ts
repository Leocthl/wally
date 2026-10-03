// Edges of the fixed rules reader that a review found: a sentence that says "no unverified sellers" must not loosen the seller check,
// a per-item limit or a measure word must not become the budget, and an absurd number of days must not throw. Fail closed throughout:
// when a sentence is unclear the stricter reading stands, and what cannot be read is said, never guessed.
import { describe, expect, it } from "vitest";
import { compileMandate, chipsToRules } from "../src/booth/compile";
import { compileRules } from "../src/booth/backend/compileRules";
import { readAmounts } from "../src/booth/zhReader";
import { applySentence, EMPTY_FORM } from "../src/screens/seal/sealModel";

const NOW = new Date("2026-10-03T04:00:00Z");
const verifiedOnly = (sentence: string): boolean => chipsToRules(compileMandate(sentence, NOW).chips).seller_check.require_capture;

describe("sellers: the stricter reading stands", () => {
  it("keeps verified-only when the sentence turns unverified sellers away", () => {
    for (const sentence of [
      "HK$800 買衫，只限已驗證賣家，唔好揀未驗證賣家",
      "HK$800 買衫，唔好揀未驗證賣家",
      "HK$800 for clothes, verified sellers only, never unverified sellers",
      "HK$800 for clothes, avoid unverified sellers",
      "HK$800 for clothes, no unverified sellers",
      "HK$800 for clothes, not any seller",
    ]) {
      expect(verifiedOnly(sentence), sentence).toBe(true);
    }
  });

  it("still lets any seller through when the sentence says so", () => {
    for (const sentence of ["HK$800 for clothes, any seller", "HK$800 for clothes, unverified sellers are fine", "HK$800 買衫，任何賣家都得", "HK$800 買衫，唔使驗證"]) {
      expect(verifiedOnly(sentence), sentence).toBe(false);
    }
  });

  it("reads a sentence that asks for both as verified-only", () => {
    expect(verifiedOnly("HK$800 for clothes, any seller, but verified sellers first")).toBe(true);
  });

  it("does not read an unverified-seller phrase as a request for verified ones (未驗證 is not 驗證)", () => {
    expect(verifiedOnly("HK$800 買衫，未驗證賣家都得")).toBe(true); // says neither clearly: the default stands
  });
});

describe("amounts: the budget is the budget", () => {
  it("does not take a per-item limit for the budget", () => {
    const rules = chipsToRules(compileMandate("每件最多1000蚊，預算500蚊買衫", NOW).chips);
    expect(rules.budget.amount_minor).toBe(50_000);
    expect(rules.per_purchase?.hard_cap_minor).toBe(100_000);
  });

  it("does not take a measure word for money: 一塊 is a piece, 五百塊 is HK$500", () => {
    expect(readAmounts("買一塊衫 HK$500").map((a) => a.minor)).toEqual([50_000]);
    expect(readAmounts("五百塊買衫").map((a) => a.minor)).toEqual([50_000]);
    expect(readAmounts("兩塊").map((a) => a.minor)).toEqual([]);
    const missing = compileMandate("預算五塊買衫", NOW);
    expect(missing.issues.map((i) => i.en)).toContain("No HK$ amount found. Write the budget, for example HK$800.");
  });
});

describe("days: absurd numbers are not a length", () => {
  const absurd = ["HK$500 for clothes for 99999999999 days", `HK$500 for clothes for ${"9".repeat(400)} days`, "HK$500 買衫，未來九千九百九十九萬日"];

  it("never throws a RangeError, in the parser, the rows and the compile call (which says it cannot read the sentence)", async () => {
    for (const sentence of absurd) {
      expect(() => compileMandate(sentence, NOW), sentence).not.toThrow();
      expect(() => applySentence(EMPTY_FORM(NOW), sentence, NOW), sentence).not.toThrow();
      await expect(compileRules({ text: sentence, locale: "en" }, { now: NOW, model: null }), sentence).rejects.toMatchObject({ name: "BoothError", status: 422, code: "CANNOT_COMPILE" });
    }
  });

  it("says the length cannot be used instead of guessing one", () => {
    for (const sentence of absurd) {
      const result = compileMandate(sentence, NOW);
      expect(result.issues.map((i) => i.en), sentence).toContain("That is more days than a budget can run.");
    }
  });
});
