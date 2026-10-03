// Seal form model: a sentence fills the rows through the deterministic compile; rows validate with plain errors; only
// valid rows become a SealRequest (fail closed). Dates are Hong Kong days.
import { describe, expect, it } from "vitest";
import { M0_SENTENCE } from "../src/booth/compile";
import {
  applySentence, describeRules, EMPTY_FORM, endOfHkDay, formFromRules, hkDay, isValid, monthEndDay, moneyOf, toRules, toSealRequest, validate, type RulesForm,
} from "../src/screens/seal/sealModel";

const NOW = new Date("2026-10-03T02:00:00Z"); // 10:00 in Hong Kong
const base = (over: Partial<RulesForm> = {}): RulesForm => ({ ...EMPTY_FORM(NOW), amount: "800", categories: ["apparel"], ...over });

describe("Hong Kong days", () => {
  it("reads the calendar day in Hong Kong, not UTC", () => {
    expect(hkDay("2026-10-03T17:30:00Z")).toBe("2026-10-04");
    expect(hkDay("2026-10-03T15:59:59Z")).toBe("2026-10-03");
  });

  it("ends a day at its last second in Hong Kong, as RFC 3339 UTC", () => {
    expect(endOfHkDay("2026-10-31")).toBe("2026-10-31T15:59:59Z");
  });

  it("knows the last day of this month in Hong Kong", () => {
    expect(monthEndDay(NOW)).toBe("2026-10-31");
    expect(monthEndDay(new Date("2026-10-31T17:00:00Z"))).toBe("2026-11-30");
  });
});

describe("a sentence fills the rows", () => {
  it("reads the preset: HK$800, clothes, verified sellers, until month end", () => {
    const read = applySentence(EMPTY_FORM(NOW), M0_SENTENCE, NOW);
    expect(read.complete).toBe(true);
    expect(read.form).toEqual({ amount: "800", categories: ["apparel"], verifiedOnly: true, until: "2026-10-31", askAbove: null, cap: null, share: null });
  });

  it("reads days, any seller and ask-above, and keeps the budget apart from the ask amount", () => {
    const read = applySentence(EMPTY_FORM(NOW), "HK$500 for shoes over the next 14 days, any seller; ask me above HK$300", NOW);
    expect(read.form.amount).toBe("500");
    expect(read.form.categories).toEqual(["footwear"]);
    expect(read.form.verifiedOnly).toBe(false);
    expect(read.form.until).toBe("2026-10-17");
    expect(read.form.askAbove).toBe("300");
  });

  it("keeps rows the sentence says nothing about, and says the sentence was incomplete", () => {
    const start = base({ categories: ["groceries"], verifiedOnly: false, until: "2026-12-01" });
    const read = applySentence(start, "HK$650 please", NOW);
    expect(read.complete).toBe(false);
    expect(read.form).toEqual({ ...start, amount: "650" });
  });

  it("does not understand Chinese words for categories, so the rows keep their values", () => {
    const read = applySentence(base(), "今個月 HK$900 買衫", NOW);
    expect(read.form.amount).toBe("900");
    expect(read.form.categories).toEqual(["apparel"]);
  });
});

describe("a date in the sentence fills the Until row", () => {
  const read = (sentence: string, start: RulesForm = EMPTY_FORM(NOW)) => applySentence(start, sentence, NOW);

  it.each([
    ["HK$800 for clothes until 20 Oct", "2026-10-20"],
    ["HK$800 for clothes by 2026-10-20", "2026-10-20"],
    ["HK$800 for clothes before Oct 20", "2026-10-20"],
    ["HK$800 for clothes until the end of October", "2026-10-31"],
    ["HK$800 for clothes, 10月20日前", "2026-10-20"],
    ["HK$800 for clothes, 十月底前", "2026-10-31"],
  ])("%s", (sentence, until) => {
    const result = read(sentence);
    expect(result.form.until).toBe(until);
    expect(result.cappedTo).toBeNull();
    expect(validate(result.form, NOW).until).toBeUndefined();
  });

  it("cuts a date more than 31 days away to the latest day a budget can run to, and says it did", () => {
    const result = read("HK$800 for clothes until 31 Dec");
    expect(result.form.until).toBe("2026-11-03");
    expect(result.cappedTo).toBe("2026-11-03");
    expect(read("HK$800 for clothes until the end of November").cappedTo).toBe("2026-11-03");
    expect(read("HK$800 for clothes until 20 Oct").cappedTo).toBeNull();
  });

  it("the row stays editable: a date typed by hand is kept as typed", () => {
    const typed = { ...read("HK$800 for clothes until 31 Dec").form, until: "2026-12-31" };
    expect(validate(typed, NOW).until).toBeUndefined();
    expect(toSealRequest("x", { ...typed, categories: ["apparel"] }, NOW).validUntil).toBe("2026-12-31T15:59:59Z");
  });

  it("a date that is not on the calendar leaves the row as it was", () => {
    const start = base({ until: "2026-10-25" });
    expect(read("HK$800 for clothes until 31 Feb", start).form.until).toBe("2026-10-25");
  });

  it("a sentence that names no date leaves the row as it was; this month still means the month's end", () => {
    const start = base({ until: "2026-10-25" });
    expect(read("HK$650 for clothes", start).form.until).toBe("2026-10-25");
    expect(read("HK$650 for clothes this month", start).form.until).toBe("2026-10-31");
  });

  it("days still count from now, and the earlier of a length and a date wins", () => {
    expect(read("HK$500 for shoes over the next 14 days").form.until).toBe("2026-10-17");
    expect(read("HK$500 for shoes for 14 days, until 10 Oct").form.until).toBe("2026-10-10");
    expect(read("HK$500 for shoes for 7 days, until 31 Oct").form.until).toBe("2026-10-10");
    expect(read("HK$500 for shoes this month until 3 Nov").form.until).toBe("2026-10-31");
  });

  it("seals the date it read, to the last second of that Hong Kong day", () => {
    const form = read("HK$800 for clothes until 20 Oct").form;
    expect(toSealRequest("HK$800 for clothes until 20 Oct", form, NOW).validUntil).toBe("2026-10-20T15:59:59Z");
  });
});

describe("validation", () => {
  it("accepts the preset rows", () => {
    expect(validate(base(), NOW)).toEqual({});
    expect(isValid(validate(base(), NOW))).toBe(true);
  });

  it.each([
    ["", "seal.errAmount"],
    ["0", "seal.errAmount"],
    ["8a", "seal.errFormat"],
    ["12.345", "seal.errFormat"],
  ])("amount %j is %s", (amount, key) => {
    expect(validate(base({ amount }), NOW).amount).toBe(key);
  });

  it("takes thousands separators and a typed HK$ sign", () => {
    expect(moneyOf("HK$1,200.50")).toBe(120050);
    expect(validate(base({ amount: "1,200" }), NOW).amount).toBeUndefined();
  });

  it("needs at least one category", () => {
    expect(validate(base({ categories: [] }), NOW).categories).toBe("seal.errCategory");
  });

  it("needs a real date, today or later", () => {
    expect(validate(base({ until: "" }), NOW).until).toBe("seal.errDate");
    expect(validate(base({ until: "2026-10-02" }), NOW).until).toBe("seal.errUntil");
    expect(validate(base({ until: "2026-10-03" }), NOW).until).toBeUndefined();
  });

  it("checks the optional per-buy rules only when they are set", () => {
    expect(validate(base({ askAbove: "0" }), NOW).askAbove).toBe("seal.errAmount");
    expect(validate(base({ share: "150" }), NOW).share).toBe("seal.errPercent");
    expect(validate(base({ share: "50" }), NOW).share).toBeUndefined();
  });
});

describe("rules and the seal request", () => {
  it("builds the signed rules from the rows", () => {
    expect(toRules(base({ askAbove: "300", cap: "400", share: "50", verifiedOnly: false }))).toEqual({
      budget: { amount_minor: 80000, currency: "HKD" },
      per_purchase: { hard_cap_minor: 40000, share_of_remaining_bp: 5000, ask_above_minor: 30000 },
      categories: ["apparel"],
      merchants: { allow: null, deny: [] },
      seller_check: { require_capture: false },
    });
  });

  it("refuses to build a request from invalid rows (fail closed)", () => {
    expect(() => toSealRequest("x", base({ amount: "" }), NOW)).toThrow();
    expect(() => toRules(base({ categories: [] }))).toThrow();
  });

  it("valid until the end of the chosen Hong Kong day; an empty sentence gets a plain description", () => {
    const req = toSealRequest("  ", base({ until: "2026-10-20" }), NOW);
    expect(req.validUntil).toBe("2026-10-20T15:59:59Z");
    expect(req.intentText).toBe(describeRules(base({ until: "2026-10-20" })));
    expect(req.intentText).toBe("HK$800 for apparel until 2026-10-20, verified sellers only");
  });

  it("round-trips signed rules back into rows (Top up, Change the rules)", () => {
    const form = base({ askAbove: "300", until: "2026-10-31" });
    expect(formFromRules(toRules(form), endOfHkDay(form.until))).toEqual(form);
  });
});
