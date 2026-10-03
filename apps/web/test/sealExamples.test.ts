// Every example the Seal screen ships, in English and in 繁體, must read back into a budget and its rules through the fixed rules
// parser (booth/compile.ts: what runs with no model, on the public copy and when the local model is down), end to end through
// the same compileRules the booth and the phone answer with. And the common ways to say a budget in Chinese must read: 八百蚊,
// 800蚊, $800, HK$800, 港幣, 衫/衣服/鞋/波鞋/電子產品/雜貨, 兩星期內, 十月尾/十月底前, 本月, 已驗證賣家.
import { describe, expect, it } from "vitest";
import { compileMandate, chipsToRules, validUntilFor } from "../src/booth/compile";
import { compileRules } from "../src/booth/backend/compileRules";
import { zhInteger, readAmounts } from "../src/booth/zhReader";
import { EXAMPLES, type ExampleId } from "../src/screens/seal/examples";
import { applySentence, EMPTY_FORM } from "../src/screens/seal/sealModel";

const NOW = new Date("2026-10-03T04:00:00Z"); // a Saturday in Hong Kong, so "this month" ends on the 31st

interface Expected {
  readonly budgetMinor: number;
  readonly categories: readonly string[];
  readonly verifiedOnly: boolean;
  readonly askAboveMinor?: number;
  /** The budget ends this many days after the seal; absent: at the month's end. */
  readonly days?: number;
}

const WANT: Readonly<Record<ExampleId, Expected>> = {
  clothes: { budgetMinor: 80_000, categories: ["apparel"], verifiedOnly: true },
  shoes: { budgetMinor: 50_000, categories: ["footwear"], verifiedOnly: true, askAboveMinor: 30_000, days: 14 },
  groceries: { budgetMinor: 30_000, categories: ["groceries"], verifiedOnly: false },
};

const MONTH_END = "2026-10-31T15:59:59Z";
const daysAfterNow = (n: number): string => new Date(NOW.getTime() + n * 86_400_000).toISOString().replace(".000Z", "Z");

function check(rules: ReturnType<typeof chipsToRules>, validUntil: string, want: Expected, where: string): void {
  expect(rules.budget.amount_minor, `${where}: budget`).toBe(want.budgetMinor);
  expect([...rules.categories], `${where}: categories`).toEqual([...want.categories]);
  expect(rules.seller_check.require_capture, `${where}: verified sellers`).toBe(want.verifiedOnly);
  expect(rules.per_purchase?.ask_above_minor, `${where}: ask above`).toBe(want.askAboveMinor);
  expect(validUntil, `${where}: ends`).toBe(want.days === undefined ? MONTH_END : daysAfterNow(want.days));
}

describe("every shipped example sentence reads into a budget and its rules", () => {
  for (const example of EXAMPLES) {
    for (const [locale, sentence] of [["en", example.sentence.en], ["zh-HK", example.sentence.zh]] as const) {
      it(`${example.id} in ${locale}: ${sentence}`, async () => {
        const want = WANT[example.id];
        const compiled = compileMandate(sentence, NOW);
        expect(compiled.issues, "issues").toEqual([]);
        check(chipsToRules(compiled.chips), validUntilFor(compiled.chips, NOW), want, "the parser");
        // The same sentence through the booth's compile call, the way "Read my sentence" sends it with no model behind it.
        const result = await compileRules({ text: sentence, locale }, { now: NOW, model: null });
        expect(result.source).toBe("rules");
        expect(result.confirmRequired).toBe(true);
        check(result.rules, result.validUntil, want, "compileRules");
        // And into the rows while it is typed.
        const rows = applySentence(EMPTY_FORM(NOW), sentence, NOW);
        expect(rows.complete).toBe(true);
        expect(rows.form.amount).toBe(String(want.budgetMinor / 100));
        expect([...rows.form.categories]).toEqual([...want.categories]);
        expect(rows.form.verifiedOnly).toBe(want.verifiedOnly);
      });
    }
  }

  it("covers every example the screen offers", () => {
    expect(EXAMPLES.map((e) => e.id).sort()).toEqual(Object.keys(WANT).sort());
  });
});

describe("the common ways to say a budget in Chinese", () => {
  const cases: readonly (readonly [string, Expected])[] = [
    ["我想用八百蚊買衫", { budgetMinor: 80_000, categories: ["apparel"], verifiedOnly: true }],
    ["800蚊買衣服", { budgetMinor: 80_000, categories: ["apparel"], verifiedOnly: true }],
    ["800 蚊買波鞋", { budgetMinor: 80_000, categories: ["footwear"], verifiedOnly: true }],
    ["$800 買電子產品", { budgetMinor: 80_000, categories: ["electronics"], verifiedOnly: true }],
    ["HK$800 買雜貨", { budgetMinor: 80_000, categories: ["groceries"], verifiedOnly: true }],
    ["港幣800買衫", { budgetMinor: 80_000, categories: ["apparel"], verifiedOnly: true }],
    ["港幣 800 元買鞋", { budgetMinor: 80_000, categories: ["footwear"], verifiedOnly: true }],
    ["港幣$600買衫同鞋", { budgetMinor: 60_000, categories: ["apparel", "footwear"], verifiedOnly: true }],
    ["一千二蚊買衫", { budgetMinor: 120_000, categories: ["apparel"], verifiedOnly: true }],
    ["一千五百蚊買衫", { budgetMinor: 150_000, categories: ["apparel"], verifiedOnly: true }],
    ["兩百五十蚊買鞋", { budgetMinor: 25_000, categories: ["footwear"], verifiedOnly: true }],
    ["HK$800 買衫，兩星期內", { budgetMinor: 80_000, categories: ["apparel"], verifiedOnly: true, days: 14 }],
    ["HK$800 買衫，一個星期", { budgetMinor: 80_000, categories: ["apparel"], verifiedOnly: true, days: 7 }],
    ["HK$800 買衫，未來 30 日", { budgetMinor: 80_000, categories: ["apparel"], verifiedOnly: true, days: 30 }],
    ["HK$800 買衫，10 日內", { budgetMinor: 80_000, categories: ["apparel"], verifiedOnly: true, days: 10 }],
    ["本月 HK$300 買雜貨", { budgetMinor: 30_000, categories: ["groceries"], verifiedOnly: true }],
    ["HK$500 買衫，已驗證賣家", { budgetMinor: 50_000, categories: ["apparel"], verifiedOnly: true }],
    ["HK$500 買衫，任何賣家都得", { budgetMinor: 50_000, categories: ["apparel"], verifiedOnly: false }],
    ["HK$500 買衫，超過 HK$300 要問我", { budgetMinor: 50_000, categories: ["apparel"], verifiedOnly: true, askAboveMinor: 30_000 }],
    ["500蚊買衫，多過三百蚊就要問我", { budgetMinor: 50_000, categories: ["apparel"], verifiedOnly: true, askAboveMinor: 30_000 }],
  ];
  for (const [sentence, want] of cases) {
    it(sentence, () => {
      const compiled = compileMandate(sentence, NOW);
      expect(compiled.issues, "issues").toEqual([]);
      check(chipsToRules(compiled.chips), validUntilFor(compiled.chips, NOW), want, sentence);
    });
  }

  it("reads the month's end, 十月尾 and 十月底前, as the date the budget ends", () => {
    for (const sentence of ["我想用港幣$600買衫同鞋，到十月尾", "十月底前 HK$500 買衣服"]) {
      const compiled = compileMandate(sentence, NOW);
      expect(compiled.issues, sentence).toEqual([]);
      expect(validUntilFor(compiled.chips, NOW), sentence).toBe(MONTH_END);
    }
  });

  it("reads a single cap on a purchase", () => {
    const compiled = compileMandate("HK$800 買衫，單次最多 HK$200", NOW);
    expect(chipsToRules(compiled.chips).per_purchase).toEqual({ hard_cap_minor: 20_000 });
    expect(chipsToRules(compiled.chips).budget.amount_minor).toBe(80_000);
  });

  it("keeps a sentence that says nothing about sellers on verified ones (fail closed)", () => {
    expect(chipsToRules(compileMandate("HK$500 買衫", NOW).chips).seller_check.require_capture).toBe(true);
  });

  it("does not mistake a date for a length, or a year for an amount", () => {
    const dated = compileMandate("HK$500 買衫，10月31日前", NOW);
    expect(dated.issues).toEqual([]);
    expect(validUntilFor(dated.chips, NOW)).toBe(MONTH_END);
    const year = compileMandate("2026年 HK$500 買衫", NOW);
    expect(chipsToRules(year.chips).budget.amount_minor).toBe(50_000);
  });

  it("still says what is missing, in both languages, for a Chinese sentence with no amount or no category", () => {
    const noAmount = compileMandate("我想買衫", NOW);
    expect(noAmount.issues.map((i) => i.zh)).toContain("找不到港幣金額。請寫明預算金額，例如 HK$800。");
    const noCategory = compileMandate("HK$500 買嘢", NOW);
    expect(noCategory.issues.map((i) => i.zh)).toContain("找不到已知類別。可試衣服、鞋、電子產品或雜貨。");
  });
});

describe("numbers written in Chinese", () => {
  const table: readonly (readonly [string, number])[] = [
    ["八", 8], ["十", 10], ["十二", 12], ["二十", 20], ["二十五", 25], ["廿五", 25], ["卅", 30], ["八百", 800], ["三百五", 350], ["兩百", 200],
    ["一千", 1000], ["一千二", 1200], ["二千五百", 2500], ["一千零五", 1005], ["一萬", 10_000], ["兩萬", 20_000], ["兩萬五", 25_000], ["三萬二千", 32_000],
  ];
  for (const [text, value] of table) {
    it(`${text} is ${value}`, () => {
      expect(zhInteger(text)).toBe(value);
    });
  }

  it("is not a number when it is not one: a year written in digits, a word, a double digit", () => {
    for (const text of ["", "二零二六", "八百a", "蚊", "百"]) expect(zhInteger(text), text).toBeNull();
  });

  it("finds each amount once, in order, and never reads a US$ amount as Hong Kong money", () => {
    expect(readAmounts("HK$800蚊").map((a) => a.minor)).toEqual([80_000]);
    expect(readAmounts("US$50 and 八百蚊").map((a) => a.minor)).toEqual([80_000]);
    expect(readAmounts("100蚊 同 二百蚊").map((a) => a.minor)).toEqual([10_000, 20_000]);
  });
});
