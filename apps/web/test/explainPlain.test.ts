// The plain-language glossary for the Evidence screen, part one: shares, the headline, the layer line, the limit that
// goes with every zero, what counted as risky, and the chip. Result numbers in, sentences out, from templates only. Every
// sentence exists in EN and zh-HK, never claims more than the counts say, and carries its figures as slots.
import { describe, expect, it } from "vitest";
import {
  chipDetails,
  chipLabel,
  headlineOf,
  layersLine,
  plainText,
  riskyKindsSentence,
  secondsOf,
  shareOf,
  upperBoundOf,
  zeroLimit,
  type Sentence,
} from "../src/evidence/explainPlain";

const en = (s: Sentence): string => plainText(s, "en");
const zh = (s: Sentence): string => plainText(s, "zh");

describe("shareOf: a count as a share a person can hold", () => {
  it("is none for 0 and all for n of n", () => {
    expect(shareOf({ k: 0, n: 66 })).toEqual({ kind: "none" });
    expect(shareOf({ k: 66, n: 66 })).toEqual({ kind: "all" });
  });

  it("rounds to the nearest tenth, and says when it is not exact", () => {
    expect(shareOf({ k: 61, n: 66 })).toEqual({ kind: "tenths", tenths: 9, exact: false });
    expect(shareOf({ k: 48, n: 66 })).toEqual({ kind: "tenths", tenths: 7, exact: false });
    expect(shareOf({ k: 9, n: 10 })).toEqual({ kind: "tenths", tenths: 9, exact: true });
    expect(shareOf({ k: 1, n: 2 })).toEqual({ kind: "tenths", tenths: 5, exact: true });
    expect(shareOf({ k: 41, n: 84 })).toEqual({ kind: "tenths", tenths: 5, exact: false });
  });

  it("never rounds a miss up to all, or a hit down to none", () => {
    expect(shareOf({ k: 63, n: 66 })).toEqual({ kind: "nearlyAll" }); // 95.5%
    expect(shareOf({ k: 149, n: 150 })).toEqual({ kind: "nearlyAll" });
    expect(shareOf({ k: 1, n: 150 })).toEqual({ kind: "almostNone" });
    expect(shareOf({ k: 3, n: 66 })).toEqual({ kind: "almostNone" }); // 4.5%
    expect(shareOf({ k: 4, n: 66 })).toEqual({ kind: "tenths", tenths: 1, exact: false }); // 6.1%
  });

  it("has no share without a denominator and refuses nonsense", () => {
    expect(shareOf({ k: 0, n: 0 })).toBeNull();
    expect(() => shareOf({ k: 2, n: 1 })).toThrow(RangeError);
    expect(() => shareOf({ k: -1, n: 5 })).toThrow(RangeError);
    expect(() => shareOf({ k: 1.5, n: 5 })).toThrow(RangeError);
  });
});

describe("the headline: always on our own test set", () => {
  const all = shareOf({ k: 84, n: 84 });
  const nine = shareOf({ k: 61, n: 66 });

  it("says it as plainly as the run allows", () => {
    const h = headlineOf(all, nine);
    expect(h?.en).toBe("On our own test set, Wally stopped every risky purchase, and let about nine in ten honest ones through.");
    expect(h?.zh).toBe("在我們自己的測試中，Wally 攔截了每一宗高風險購買，並讓約九成正常購買順利完成。");
  });

  it("states a worse result as plainly as a better one", () => {
    expect(headlineOf(shareOf({ k: 41, n: 84 }), shareOf({ k: 48, n: 66 }))?.en).toBe("On our own test set, Wally stopped about five in ten of the risky purchases, and let about seven in ten honest ones through.");
    expect(headlineOf(shareOf({ k: 0, n: 84 }), shareOf({ k: 66, n: 66 }))?.en).toBe("On our own test set, Wally stopped none of the risky purchases, and let every honest one through.");
    expect(headlineOf(shareOf({ k: 80, n: 84 }), shareOf({ k: 66, n: 66 }))?.en).toBe("On our own test set, Wally stopped nearly all of the risky purchases, and let every honest one through.");
  });

  it("says only the half it can back, and nothing when it has neither", () => {
    expect(headlineOf(all, null)?.en).toBe("On our own test set, Wally stopped every risky purchase.");
    expect(headlineOf(null, nine)?.en).toBe("On our own test set, Wally let about nine in ten honest purchases through.");
    expect(headlineOf(null, null)).toBeNull();
  });

  it("uses no digit", () => {
    for (const h of [headlineOf(all, nine), headlineOf(shareOf({ k: 1, n: 150 }), shareOf({ k: 3, n: 66 }))]) {
      expect(h?.en).not.toMatch(/\d/);
      expect(h?.zh).not.toMatch(/\d/);
    }
  });
});

describe("the layer line under the headline: what rules do and what the listing check adds", () => {
  it("says both when both hold in the file", () => {
    expect(layersLine({ rulesHoldLimit: true, listingCheckAdds: true })?.en).toBe(
      "Rules and the card limit already keep spending under the limit. The listing check is what stops trick listings that rules alone let through.",
    );
  });

  it("says only what the file backs", () => {
    expect(layersLine({ rulesHoldLimit: true, listingCheckAdds: false })?.en).toBe("Rules and the card limit already keep spending under the limit.");
    expect(layersLine({ rulesHoldLimit: false, listingCheckAdds: true })?.en).toBe("The listing check is what stops trick listings that rules alone let through.");
    expect(layersLine({ rulesHoldLimit: false, listingCheckAdds: false })).toBeNull();
  });

  it("exists in 繁 without a digit", () => {
    const both = layersLine({ rulesHoldLimit: true, listingCheckAdds: true });
    expect(both?.zh).toContain("商品檢查");
    expect(both?.zh).not.toMatch(/\d/);
  });
});

describe("a zero never stands alone: the limit that goes with it", () => {
  it("is the top of the 95 percent interval for 0 of n, as whole parts of a hundred", () => {
    expect(upperBoundOf(84)).toBe(4);
    expect(upperBoundOf(150)).toBe(2);
    expect(upperBoundOf(13)).toBe(23);
    expect(upperBoundOf(66)).toBe(6);
    expect(upperBoundOf(1)).toBe(79);
  });

  it("never shows less than 1 in a hundred, however large n is", () => {
    expect(upperBoundOf(10_000)).toBe(1);
  });

  it("refuses a missing denominator", () => {
    expect(() => upperBoundOf(0)).toThrow(RangeError);
    expect(() => upperBoundOf(2.5)).toThrow(RangeError);
  });

  it("is said in words with the limit as a figure, per kind of zero", () => {
    expect(en(zeroLimit("limit", 150))).toBe("None went over on our own test set, but the true rate could still be up to about 2 in a hundred.");
    expect(en(zeroLimit("risky", 84))).toBe("None got through on our own test set, but the true rate could still be up to about 4 in a hundred.");
    expect(en(zeroLimit("tricks", 13))).toBe("Wally let none through on our own test set. With so few listings, the true rate could still be up to about 23 in a hundred.");
    expect(en(zeroLimit("blocked", 66))).toBe("None was blocked by mistake on our own test set, but the true rate could still be up to about 6 in a hundred.");
    expect(zeroLimit("risky", 84).slots).toEqual({ x: 4 });
    expect(zh(zeroLimit("risky", 84))).toBe("在我們自己的測試中沒有任何一宗漏網，但真實比率仍可能高達約每一百宗有 4 宗。");
  });
});

describe("what counted as risky, in words from the categories present", () => {
  it("lists the kinds the run really had, in a fixed order, at most five", () => {
    const s = riskyKindsSentence(["within_budget", "wrong_merchant", "shipping_overflow", "price_drift", "flagged_seller", "injected_text", "replay", "velocity_burst"]);
    expect(s?.en).toBe("They included going over the budget, listings that try to give Wally orders, a seller on the flagged-seller list, the wrong shop and a card used twice.");
    expect(s?.zh).toBe("包括：超出預算、想指揮 Wally 的商品頁、在賣家名單上被標記的賣家、錯誤的商店及一張卡用兩次。");
  });

  it("drops duplicates and categories it has no words for, and is silent when nothing is left", () => {
    expect(riskyKindsSentence(["fees", "shipping_overflow", "mystery"])?.en).toBe("They included going over the budget.");
    expect(riskyKindsSentence(["within_budget", "mystery"])).toBeNull();
    expect(riskyKindsSentence([])).toBeNull();
  });

  it("joins two with and, three with commas then and", () => {
    expect(riskyKindsSentence(["wrong_merchant", "replay"])?.en).toBe("They included the wrong shop and a card used twice.");
    expect(riskyKindsSentence(["flagged_seller", "wrong_merchant", "replay"])?.en).toBe("They included a seller on the flagged-seller list, the wrong shop and a card used twice.");
  });
});

describe("seconds a person can feel", () => {
  it("rounds to what reads well and never shows a real time as zero", () => {
    expect(secondsOf(159.7)).toBe("0.16");
    expect(secondsOf(388.9)).toBe("0.39");
    expect(secondsOf(1369.7)).toBe("1.4");
    expect(secondsOf(12_400)).toBe("12");
    expect(secondsOf(5)).toBe("0.01");
    expect(secondsOf(1)).toBe("under 0.01");
    expect(secondsOf(0.4)).toBe("under 0.01");
    expect(secondsOf(0)).toBe("0.00");
    expect(() => secondsOf(-1)).toThrow(RangeError);
    expect(() => secondsOf(Number.NaN)).toThrow(RangeError);
  });
});

describe("the chip, in plain words: our own test shoppers, a simulated shop", () => {
  it("measured and replayed say how many shoppers and where", () => {
    expect(chipLabel("MEASURED", 150).en).toBe("Measured on 150 of our own test shoppers, in a simulated shop");
    expect(chipLabel("RECORDED", 150).en).toBe("Replayed from a recording of 150 of our own test shoppers, in a simulated shop");
    expect(chipLabel("MEASURED", 150).zh).toBe("在模擬商店中，以我們自己的 150 位測試購物者量度");
  });

  it("falls back to the kind alone when the sample size is unknown", () => {
    expect(chipLabel("MEASURED", null).en).toBe("Measured on our own test shoppers, in a simulated shop");
    expect(chipLabel("ASSUMED", null).en).toBe("Assumed");
    expect(chipLabel("OBSERVED", null).en).toBe("Observed");
    expect(chipLabel("SIMULATED", null).en).toBe("Simulated");
  });

  it("the tap-for-details text says what the kind means and what it does not promise", () => {
    expect(chipDetails("MEASURED").en).toContain("we counted the results ourselves");
    expect(chipDetails("MEASURED").en).toContain("our own test set");
    expect(chipDetails("MEASURED").en).toContain("No real shop, card or money");
    expect(chipDetails("MEASURED").en).toContain("could give different numbers");
    expect(chipDetails("RECORDED").en).toContain("recorded earlier");
  });

  it("never prints a count of tests or test files", () => {
    for (const kind of ["MEASURED", "RECORDED", "ASSUMED", "OBSERVED", "SIMULATED"] as const) {
      for (const text of [chipLabel(kind, 150), chipDetails(kind)]) {
        expect(`${text.en} ${text.zh}`).not.toMatch(/\d+\s+(tests?|files?)|test files|tests pass/i);
      }
    }
  });
});
