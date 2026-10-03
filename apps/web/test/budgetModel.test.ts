// The first budget as a form (screens/onboarding/budgetModel.ts): presets, how long, what Wally can buy; the rules it
// builds are the Seal screen's own RulesForm (so the same checks apply), and the sentence that is signed with them reads
// back to the same rules through the booth's own reader.
import { describe, expect, it } from "vitest";
import {
  capUntil,
  draftFor,
  formOf,
  HOW_LONG,
  maxDay,
  PRESETS_HKD,
  presetFor,
  sentenceFor,
  type BudgetDraft,
} from "../src/screens/onboarding/budgetModel";
import { applySentence, EMPTY_FORM, isValid, monthEndDay, toSealRequest, validate } from "../src/screens/seal/sealModel";
import { mergeProfile } from "../src/state/profile";

const NOW = new Date("2026-10-03T02:00:00Z"); // 10:00 on Saturday 3 October in Hong Kong

describe("presets", () => {
  it("offers the four amounts of the brief, smallest first", () => {
    expect(PRESETS_HKD).toEqual([300, 500, 800, 1200]);
  });

  it("starts from what the person shops for: groceries small, shoes in the middle, anything else the ready-made amount", () => {
    expect(presetFor(null)).toBe(800);
    expect(presetFor(mergeProfile(null, { shopFor: ["groceries"] }))).toBe(300);
    expect(presetFor(mergeProfile(null, { shopFor: ["footwear"] }))).toBe(500);
    expect(presetFor(mergeProfile(null, { shopFor: ["apparel"] }))).toBe(800);
    expect(presetFor(mergeProfile(null, { shopFor: ["footwear", "apparel"] }))).toBe(800);
    expect(presetFor(mergeProfile(null, { shopFor: ["electronics"] }))).toBe(800);
  });
});

describe("draftFor", () => {
  it("is the ready-made budget without a profile: HK$800, this month, clothes, verified sellers", () => {
    expect(draftFor(null, NOW)).toMatchObject({ amount: 800, howLong: "month", categories: ["apparel"], verifiedOnly: true, custom: "" });
  });

  it("pre-fills the categories from what the person shops for", () => {
    const draft = draftFor(mergeProfile(null, { shopFor: ["footwear", "groceries"] }), NOW);
    expect(draft.categories).toEqual(["footwear", "groceries"]);
    expect(draft.verifiedOnly).toBe(true);
  });

  it("offers a date a week out for the date option", () => {
    expect(draftFor(null, NOW).date).toBe("2026-10-10");
  });
});

describe("formOf", () => {
  const base: BudgetDraft = { amount: 500, custom: "", howLong: "twoWeeks", date: "2026-10-10", categories: ["footwear"], verifiedOnly: true };

  it("builds the Seal form: a preset, two weeks out, shoes, verified", () => {
    expect(formOf(base, NOW)).toEqual({ amount: "500", categories: ["footwear"], verifiedOnly: true, until: "2026-10-17", askAbove: null, cap: null, share: null });
  });

  it("this month ends on the last day of the month in Hong Kong, as Seal does", () => {
    expect(formOf({ ...base, howLong: "month" }, NOW).until).toBe(monthEndDay(NOW));
    expect(formOf({ ...base, howLong: "month" }, NOW).until).toBe("2026-10-31");
  });

  it("a date is the date, and a custom amount is what was typed", () => {
    const form = formOf({ ...base, amount: "custom", custom: "650", howLong: "date", date: "2026-10-20" }, NOW);
    expect(form).toMatchObject({ amount: "650", until: "2026-10-20" });
  });

  it("cuts a date that is further off than a budget may run, and says so", () => {
    expect(maxDay(NOW)).toBe("2026-11-03");
    expect(capUntil("2026-10-20", NOW)).toEqual({ day: "2026-10-20", capped: false });
    expect(capUntil("2026-12-25", NOW)).toEqual({ day: "2026-11-03", capped: true });
    expect(formOf({ ...base, howLong: "date", date: "2027-01-01" }, NOW).until).toBe("2026-11-03");
  });

  it("is valid for every preset and every way of choosing how long, by the Seal screen's own checks", () => {
    for (const amount of PRESETS_HKD) {
      for (const howLong of HOW_LONG) expect(validate(formOf({ ...base, amount, howLong }, NOW), NOW), `${amount} ${howLong}`).toEqual({});
    }
  });

  it("says what is wrong with a custom amount and with no category, in the Seal screen's words", () => {
    expect(validate(formOf({ ...base, amount: "custom", custom: "" }, NOW), NOW)).toEqual({ amount: "seal.errAmount" });
    expect(validate(formOf({ ...base, amount: "custom", custom: "12x" }, NOW), NOW)).toEqual({ amount: "seal.errFormat" });
    expect(validate(formOf({ ...base, amount: "custom", custom: "0" }, NOW), NOW)).toEqual({ amount: "seal.errAmount" });
    expect(validate(formOf({ ...base, categories: [] }, NOW), NOW)).toEqual({ categories: "seal.errCategory" });
  });

  it("does not change the draft", () => {
    const frozen = Object.freeze({ ...base, categories: Object.freeze(["footwear"]) as readonly string[] }) as BudgetDraft;
    formOf(frozen, NOW);
    expect(frozen.categories).toEqual(["footwear"]);
  });
});

describe("sentenceFor", () => {
  const cases: readonly (readonly [string, BudgetDraft])[] = [
    ["a preset this month", { amount: 800, custom: "", howLong: "month", date: "2026-10-10", categories: ["apparel"], verifiedOnly: true }],
    ["shoes for two weeks", { amount: 500, custom: "", howLong: "twoWeeks", date: "2026-10-10", categories: ["footwear"], verifiedOnly: true }],
    ["a custom amount until a date, any seller", { amount: "custom", custom: "1,250", howLong: "date", date: "2026-10-20", categories: ["groceries", "electronics"], verifiedOnly: false }],
    ["three categories", { amount: 1200, custom: "", howLong: "month", date: "2026-10-10", categories: ["apparel", "footwear", "groceries"], verifiedOnly: true }],
  ];

  it.each(cases)("reads back to the same rules through the booth's own reader: %s", (_name, draft) => {
    const form = formOf(draft, NOW);
    const read = applySentence(EMPTY_FORM(NOW), sentenceFor(form, "en", NOW), NOW).form;
    expect(read.amount).toBe(String(Number(form.amount.replace(/,/g, ""))));
    expect([...read.categories].sort()).toEqual([...form.categories].sort());
    expect(read.verifiedOnly).toBe(form.verifiedOnly);
    expect(read.until).toBe(form.until);
  });

  it("says it in plain words in English and in Cantonese", () => {
    const form = formOf({ amount: 500, custom: "", howLong: "twoWeeks", date: "", categories: ["footwear", "apparel"], verifiedOnly: true }, NOW);
    expect(sentenceFor(form, "en", NOW)).toBe("HK$500 for clothes and shoes over the next 14 days, verified sellers only");
    expect(sentenceFor(form, "zh-HK", NOW)).toBe("未來 14 日用 HK$500 買衫、鞋，只限認證賣家");
  });

  it("builds a seal request the engine accepts, with that sentence as the signed words", () => {
    const form = formOf(draftFor(null, NOW), NOW);
    const request = toSealRequest(sentenceFor(form, "en", NOW), form, NOW);
    expect(request.intentText).toBe("HK$800 this month for clothes, verified sellers only");
    expect(request.rules.budget.amount_minor).toBe(80_000);
    expect(request.rules.seller_check.require_capture).toBe(true);
    expect(isValid(validate(form, NOW))).toBe(true);
    expect(request.validUntil).toBe("2026-10-31T15:59:59Z");
  });
});
