// The plain-language glossary, part two: the sentences under each card, built from the counts of what each layer did
// (rules only, and Wally = rules plus the listing check). A sentence says what the counts say and no more; a zero is
// always followed by the limit it could still hide; the listing check is credited only where the file shows it adds
// something, and its cost is said as plainly as its gain.
import { describe, expect, it } from "vitest";
import {
  falseAlarmBullet,
  honestSentences,
  judgeMissSentence,
  limitSentences,
  practiceSentence,
  riskySentences,
  speedSentences,
  tricksSentences,
} from "../src/evidence/explainCards";
import { plainText, type Sentence } from "../src/evidence/explainPlain";

const en = (list: readonly Sentence[]): string[] => list.map((s) => plainText(s, "en"));
const zh = (list: readonly Sentence[]): string[] => list.map((s) => plainText(s, "zh"));

describe("went over the limit (counts are the ones that went over)", () => {
  it("rules alone already stop it: said plainly, with the limit the zero could hide", () => {
    expect(en(limitSentences({ wally: { k: 0, n: 150 }, rules: { k: 0, n: 150 } }))).toEqual([
      "Rules alone already stop this. Rules only and Wally both had none, so the listing check adds nothing here.",
      "None went over on our own test set, but the true rate could still be up to about 2 in a hundred.",
    ]);
  });

  it("with no rules-only column it says the plain thing", () => {
    expect(en(limitSentences({ wally: { k: 0, n: 150 }, rules: null }))).toEqual([
      "Not one purchase went over the budget or the card limit.",
      "None went over on our own test set, but the true rate could still be up to about 2 in a hundred.",
    ]);
    expect(en(limitSentences({ wally: { k: 2, n: 150 }, rules: null }))).toEqual(["2 of 150 purchases went over the limit."]);
  });

  it("states a difference either way as plainly", () => {
    expect(en(limitSentences({ wally: { k: 2, n: 150 }, rules: { k: 0, n: 150 } }))).toEqual(["Rules only had none go over the limit; Wally had 2."]);
    expect(en(limitSentences({ wally: { k: 0, n: 150 }, rules: { k: 3, n: 150 } }))[0]).toBe("Rules only had 3 go over the limit; Wally had none.");
    expect(en(limitSentences({ wally: { k: 4, n: 150 }, rules: { k: 4, n: 150 } }))).toEqual(["Rules only and Wally both had 4 go over the limit."]);
    expect(en(limitSentences({ wally: { k: 4, n: 150 }, rules: { k: 6, n: 150 } }))).toEqual(["Rules only had 6 go over the limit; Wally had 4."]);
  });

  it("exists in 繁", () => {
    expect(zh(limitSentences({ wally: { k: 0, n: 150 }, rules: { k: 0, n: 150 } }))[0]).toBe("單靠規則已能攔住：只用規則和用 Wally 都是零宗，所以商品檢查在這方面沒有額外作用。");
  });
});

describe("stopped before paying (counts are the risky purchases stopped)", () => {
  it("Wally's share, rules alone's share, and the limit on the zero that got through", () => {
    expect(en(riskySentences({ wally: { k: 84, n: 84 }, rules: { k: 56, n: 84 } }))).toEqual([
      "Wally stopped every one of them.",
      "Rules alone stopped about seven in ten of them.",
      "None got through on our own test set, but the true rate could still be up to about 4 in a hundred.",
    ]);
  });

  it("no zero, no limit sentence; no rules column, no rules sentence", () => {
    expect(en(riskySentences({ wally: { k: 80, n: 84 }, rules: null }))).toEqual(["Wally stopped nearly all of them."]);
    expect(en(riskySentences({ wally: { k: 41, n: 84 }, rules: { k: 84, n: 84 } }))).toEqual(["Wally stopped about five in ten of them.", "Rules alone stopped every one of them."]);
  });

  it("is empty when there are no risky purchases to speak of", () => {
    expect(riskySentences({ wally: { k: 0, n: 0 }, rules: null })).toEqual([]);
  });
});

describe("trick listings (counts are the trick listings stopped; rules alone cannot see them)", () => {
  it("rules alone let every one through, Wally none, with the limit that a small set leaves", () => {
    expect(en(tricksSentences({ wally: { k: 13, n: 13 }, rules: { k: 0, n: 13 } }))).toEqual([
      "Rules alone let every one of them through.",
      "Wally let none through on our own test set. With so few listings, the true rate could still be up to about 23 in a hundred.",
    ]);
  });

  it("states other counts as counts", () => {
    expect(en(tricksSentences({ wally: { k: 10, n: 13 }, rules: { k: 5, n: 13 } }))).toEqual(["Rules alone let 8 of 13 through.", "Wally let 3 of 13 through."]);
    expect(en(tricksSentences({ wally: { k: 13, n: 13 }, rules: { k: 13, n: 13 } }))).toEqual(["Rules alone stopped every one of them.", expect.stringContaining("Wally let none through on our own test set")]);
    expect(en(tricksSentences({ wally: { k: 0, n: 13 }, rules: null }))).toEqual(["Wally let every one through."]);
  });
});

describe("approved (counts are the honest purchases let through)", () => {
  it("Wally's share and what it blocked, then rules alone and the cost of the listing check", () => {
    expect(en(honestSentences({ wally: { k: 61, n: 66 }, rules: { k: 63, n: 66 } }))).toEqual([
      "Wally let about nine in ten honest purchases through and blocked 5 by mistake.",
      "Rules only blocked 3 by mistake. The listing check adds some false alarms.",
    ]);
    expect(zh(honestSentences({ wally: { k: 61, n: 66 }, rules: { k: 63, n: 66 } }))[0]).toBe("Wally 讓約九成正常購買順利完成，錯誤攔截了 5 宗。");
  });

  it("does not blame the listing check when rules alone blocked as many or more", () => {
    expect(en(honestSentences({ wally: { k: 61, n: 66 }, rules: { k: 61, n: 66 } }))[1]).toBe("Rules only blocked 5 by mistake.");
    expect(en(honestSentences({ wally: { k: 61, n: 66 }, rules: { k: 48, n: 66 } }))[1]).toBe("Rules only blocked 18 by mistake.");
    expect(en(honestSentences({ wally: { k: 61, n: 66 }, rules: { k: 66, n: 66 } }))[1]).toBe("Rules only blocked none by mistake. The listing check adds some false alarms.");
  });

  it("a zero blocked is followed by its limit", () => {
    expect(en(honestSentences({ wally: { k: 66, n: 66 }, rules: null }))).toEqual([
      "Wally let every honest purchase through.",
      "None was blocked by mistake on our own test set, but the true rate could still be up to about 6 in a hundred.",
    ]);
  });
});

describe("speed", () => {
  it("nearly every decision, and where the time goes when rules alone are faster", () => {
    expect(en(speedSentences({ typicalMs: 159.7, nearlyAllMs: 388.9, rulesTypicalMs: 1 }))).toEqual([
      "Nearly every decision took under 0.39 seconds.",
      "Rules alone are faster: reading the listing is what takes the time.",
    ]);
    expect(zh(speedSentences({ typicalMs: 159.7, nearlyAllMs: 388.9, rulesTypicalMs: null }))).toEqual(["幾乎每個決定都在 0.39 秒內完成。"]);
  });

  it("does not say rules alone are faster when they are not", () => {
    expect(en(speedSentences({ typicalMs: 159.7, nearlyAllMs: 388.9, rulesTypicalMs: 200 }))).toEqual(["Nearly every decision took under 0.39 seconds."]);
  });
});

describe("where Wally still gets it wrong", () => {
  it("false alarms, with the limit when there are none", () => {
    expect(en([falseAlarmBullet({ k: 5, n: 66 })])).toEqual(["Wally blocked 5 of 66 honest purchases by mistake."]);
    expect(en([falseAlarmBullet({ k: 0, n: 66 })])).toEqual(["No honest purchase was blocked by mistake in this run, but the true rate could still be up to about 6 in a hundred."]);
  });

  it("the listing check on its own: misses as a count, and what stands behind it", () => {
    expect(en([judgeMissSentence({ k: 8, n: 40 })])).toEqual(["On its own, Wally's listing check missed 8 of 40 made-up trick listings. It is only one layer: the budget limit and the card limit do not depend on it."]);
    expect(en([judgeMissSentence({ k: 0, n: 40 })])[0]).toContain("caught all 40 made-up trick listings");
  });

  it("practice only: always said, never a digit", () => {
    expect(practiceSentence().text.en).toBe("All of this comes from our own scripted test purchases in a simulated shop, with simulated cards and no real money. Real shops can behave differently.");
    expect(practiceSentence().slots).toEqual({});
  });
});

describe("every sentence", () => {
  const all: readonly Sentence[] = [
    ...limitSentences({ wally: { k: 0, n: 150 }, rules: { k: 0, n: 150 } }),
    ...limitSentences({ wally: { k: 2, n: 150 }, rules: { k: 3, n: 150 } }),
    ...limitSentences({ wally: { k: 2, n: 150 }, rules: null }),
    ...riskySentences({ wally: { k: 84, n: 84 }, rules: { k: 56, n: 84 } }),
    ...tricksSentences({ wally: { k: 13, n: 13 }, rules: { k: 0, n: 13 } }),
    ...tricksSentences({ wally: { k: 10, n: 13 }, rules: { k: 5, n: 13 } }),
    ...honestSentences({ wally: { k: 61, n: 66 }, rules: { k: 63, n: 66 } }),
    ...honestSentences({ wally: { k: 66, n: 66 }, rules: { k: 66, n: 66 } }),
    ...speedSentences({ typicalMs: 159.7, nearlyAllMs: 388.9, rulesTypicalMs: 1 }),
    falseAlarmBullet({ k: 5, n: 66 }), falseAlarmBullet({ k: 0, n: 66 }),
    judgeMissSentence({ k: 8, n: 40 }), judgeMissSentence({ k: 0, n: 40 }), practiceSentence(),
  ];

  it("exists in both languages with the same slots in each", () => {
    for (const s of all) {
      const slotsIn = (t: string): string[] => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();
      expect(slotsIn(s.text.zh), s.text.en).toEqual(slotsIn(s.text.en));
      expect(slotsIn(s.text.en), s.text.en).toEqual(Object.keys(s.slots).sort());
    }
  });

  it("holds no digit outside its slots, leaves no slot unfilled and none of the engineers' words", () => {
    const banned = /\b(B0|B1|B2|CI|p50|p95|T-H\d|F38|seed|commit|deterministic|pipeline|MEASURED|interval|Wilson|model-only)\b/;
    for (const s of all) {
      expect(s.text.en, s.text.en).not.toMatch(/\d/);
      expect(s.text.zh, s.text.zh).not.toMatch(/\d/);
      for (const text of [plainText(s, "en"), plainText(s, "zh")]) {
        expect(text).not.toMatch(/[{}]/);
        expect(text).not.toMatch(banned);
        expect(text).not.toMatch(/[—–]/); // no dashes
        expect(text).not.toMatch(/\d+\s+(tests?|files?)|test files|tests pass/i); // no count of tests or files
      }
    }
  });
});
