// The plain-language glossary for the Evidence screen: result numbers in, the sentences a person reads out, from fixed
// templates only (never model prose). Each sentence is a LabelPair with {slots}; the screen fills the slots with figures
// that wear the run's chip, so no number is ever bare. EN and zh-HK, every zh-HK line a draft for the native read.
//
// What these sentences may claim is capped by the counts they are given: "every" only for n of n, "none" only for 0 of n,
// "nearly all" never for all, and a worse result is worded as plainly as a better one.
import { label, type LabelPair } from "../i18n/label";
import type { ChipKind } from "./chip";
import type { Count } from "./judgeFit";
import { wilson } from "./stats";

export type Locale = "en" | "zh";

/** A sentence template and the figures that fill its {slots}. */
export interface Sentence {
  readonly text: LabelPair;
  readonly slots: Readonly<Record<string, number | string>>;
}

type Slots = Sentence["slots"];
export const sentence = (text: LabelPair, slots: Slots = {}): Sentence => ({ text, slots });

/** Fills the slots with plain text: for tests, accessible names and anywhere a figure needs no chip of its own. */
export function plainText(s: Sentence, locale: Locale): string {
  return s.text[locale].replace(/\{(\w+)\}/g, (whole, name: string) => (name in s.slots ? String(s.slots[name]) : whole));
}

// ---------------------------------------------------------------------------------------------------------------------
// Shares: a count as a proportion a person can hold. These boundaries are wording, not measurements.
// ---------------------------------------------------------------------------------------------------------------------

/** Below this share a non-zero count is "fewer than one in twenty"; from NEARLY_ALL up, a count short of all is "nearly all". */
const ALMOST_NONE = 0.05;
const NEARLY_ALL = 0.95;
const TENTHS = 10;

export type Share =
  | { readonly kind: "none" | "almostNone" | "nearlyAll" | "all" }
  | { readonly kind: "tenths"; readonly tenths: number; readonly exact: boolean };

export function shareOf({ k, n }: Count): Share | null {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) throw new RangeError(`needs integers with 0 <= k <= n, got ${k}/${n}`);
  if (n === 0) return null;
  if (k === 0) return { kind: "none" };
  if (k === n) return { kind: "all" };
  const p = k / n;
  if (p < ALMOST_NONE) return { kind: "almostNone" };
  if (p >= NEARLY_ALL) return { kind: "nearlyAll" };
  return { kind: "tenths", tenths: Math.min(TENTHS - 1, Math.max(1, Math.round(p * TENTHS))), exact: (k * TENTHS) % n === 0 };
}

const TEN_EN = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"] as const;
const TEN_ZH = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const; // NEEDS-REVIEW zh-HK

/** "about nine in ten" and 約九成, for a tenths share. */
export function tenthsWords(share: Extract<Share, { kind: "tenths" }>): LabelPair {
  return label(`${share.exact ? "" : "about "}${TEN_EN[share.tenths]} in ten`, `${share.exact ? "" : "約"}${TEN_ZH[share.tenths]}成`); // NEEDS-REVIEW zh-HK
}

// ---------------------------------------------------------------------------------------------------------------------
// The headline and the two card sentences about the share of purchases that were stopped or let through.
// ---------------------------------------------------------------------------------------------------------------------

/** Wally stopped ... of the risky purchases. */
function stoppedClause(share: Share): LabelPair {
  switch (share.kind) {
    case "all": return label("Wally stopped every risky purchase", "Wally 攔截了每一宗高風險購買"); // NEEDS-REVIEW zh-HK
    case "none": return label("Wally stopped none of the risky purchases", "Wally 一宗高風險購買都沒有攔截"); // NEEDS-REVIEW zh-HK
    case "nearlyAll": return label("Wally stopped nearly all of the risky purchases", "Wally 攔截了幾乎所有高風險購買"); // NEEDS-REVIEW zh-HK
    case "almostNone": return label("Wally stopped fewer than one in twenty of the risky purchases", "Wally 只攔截了不足二十分之一的高風險購買"); // NEEDS-REVIEW zh-HK
    case "tenths": {
      const w = tenthsWords(share);
      return label(`Wally stopped ${w.en} of the risky purchases`, `Wally 攔截了${w.zh}高風險購買`); // NEEDS-REVIEW zh-HK
    }
  }
}

/** Wally let ... of the honest purchases through; `after` is true when the stopped clause came first, so "and" and "ones". */
export function throughClause(share: Share, after: boolean): LabelPair {
  const lead = after ? "and let" : "Wally let";
  const what = after ? "ones" : "purchases";
  const zhLead = after ? "並讓" : "Wally 讓"; // NEEDS-REVIEW zh-HK
  switch (share.kind) {
    case "all": return label(`${lead} every honest ${after ? "one" : "purchase"} through`, `${zhLead}每一宗正常購買順利完成`); // NEEDS-REVIEW zh-HK
    case "none": return label(`${lead} none of the honest ${what} through`, after ? "但沒有讓任何正常購買順利完成" : "Wally 沒有讓任何正常購買順利完成"); // NEEDS-REVIEW zh-HK
    case "nearlyAll": return label(`${lead} nearly all honest ${what} through`, `${zhLead}幾乎所有正常購買順利完成`); // NEEDS-REVIEW zh-HK
    case "almostNone": return label(`${lead} fewer than one in twenty honest ${what} through`, after ? "但只讓不足二十分之一的正常購買順利完成" : "Wally 只讓不足二十分之一的正常購買順利完成"); // NEEDS-REVIEW zh-HK
    case "tenths": {
      const w = tenthsWords(share);
      return label(`${lead} ${w.en} honest ${what} through`, `${zhLead}${w.zh}正常購買順利完成`); // NEEDS-REVIEW zh-HK
    }
  }
}

const OWN_EN = "On our own test set, ";
const OWN_ZH = "在我們自己的測試中，"; // NEEDS-REVIEW zh-HK

/** The line at the top of the page, always "on our own test set". Only the half the run can back is said; nothing when it has neither. */
export function headlineOf(stopped: Share | null, through: Share | null): LabelPair | null {
  if (stopped !== null && through !== null) {
    const a = stoppedClause(stopped);
    const b = throughClause(through, true);
    return label(`${OWN_EN}${a.en}, ${b.en}.`, `${OWN_ZH}${a.zh}，${b.zh}。`);
  }
  const only = stopped !== null ? stoppedClause(stopped) : through !== null ? throughClause(through, false) : null;
  return only === null ? null : label(`${OWN_EN}${only.en}.`, `${OWN_ZH}${only.zh}。`);
}

/** Under the headline: what rules and the card limit already do, and what the listing check adds. Only what the file backs. */
export function layersLine({ rulesHoldLimit, listingCheckAdds }: { readonly rulesHoldLimit: boolean; readonly listingCheckAdds: boolean }): LabelPair | null {
  const rules = label("Rules and the card limit already keep spending under the limit.", "規則和卡的上限已經令支出保持在上限之內。"); // NEEDS-REVIEW zh-HK
  const check = label("The listing check is what stops trick listings that rules alone let through.", "規則單靠自己攔不住的陷阱商品頁，要靠商品檢查才攔得住。"); // NEEDS-REVIEW zh-HK
  if (rulesHoldLimit && listingCheckAdds) return label(`${rules.en} ${check.en}`, `${rules.zh}${check.zh}`);
  if (rulesHoldLimit) return rules;
  return listingCheckAdds ? check : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// A zero never stands alone: the limit of what it could still hide.
// ---------------------------------------------------------------------------------------------------------------------

const PERCENT = 100;

/**
 * The top of the 95 percent interval for 0 hits in n tries, as whole parts of a hundred (at least 1). Computed here from the
 * count, the same way the developer view computes its interval, so the two cannot differ.
 */
export function upperBoundOf(n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`needs a whole number of tries of 1 or more, got ${n}`);
  const interval = wilson(0, n);
  return Math.max(1, Math.round((interval?.high ?? 1) * PERCENT));
}

export type ZeroKind = "limit" | "risky" | "tricks" | "blocked";

const ZERO_LIMIT: Readonly<Record<ZeroKind, LabelPair>> = {
  limit: label("None went over on our own test set, but the true rate could still be up to about {x} in a hundred.", "在我們自己的測試中沒有任何一宗超出上限，但真實比率仍可能高達約每一百宗有 {x} 宗。"), // NEEDS-REVIEW zh-HK
  risky: label("None got through on our own test set, but the true rate could still be up to about {x} in a hundred.", "在我們自己的測試中沒有任何一宗漏網，但真實比率仍可能高達約每一百宗有 {x} 宗。"), // NEEDS-REVIEW zh-HK
  tricks: label("Wally let none through on our own test set. With so few listings, the true rate could still be up to about {x} in a hundred.", "在我們自己的測試中，Wally 沒有讓任何一個漏網。由於商品頁數量不多，真實比率仍可能高達約每一百個有 {x} 個。"), // NEEDS-REVIEW zh-HK
  blocked: label("None was blocked by mistake on our own test set, but the true rate could still be up to about {x} in a hundred.", "在我們自己的測試中沒有任何正常購買被錯誤攔截，但真實比率仍可能高達約每一百宗有 {x} 宗。"), // NEEDS-REVIEW zh-HK
};

/** The sentence for a zero out of n: what it counts, "on our own test set", and how high the true rate could still be. */
export function zeroLimit(kind: ZeroKind, n: number): Sentence {
  return sentence(ZERO_LIMIT[kind], { x: upperBoundOf(n) });
}

const SECONDS_ONE_DECIMAL = 1;
const SECONDS_WHOLE = 10;
/** Below half a hundredth of a second a time is shown as "under 0.01", never as a zero. */
const SECONDS_SMALLEST = 0.005;

/** Milliseconds as seconds a person can feel: 0.16, 1.4, 12. A real, tiny time is never shown as zero. */
export function secondsOf(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) throw new RangeError(`needs a time of zero or more, got ${ms}`);
  const s = ms / 1000;
  if (s >= SECONDS_WHOLE) return String(Math.round(s));
  if (s >= SECONDS_ONE_DECIMAL) return s.toFixed(1);
  if (s > 0 && s < SECONDS_SMALLEST) return "under 0.01";
  return s.toFixed(2);
}

// ---------------------------------------------------------------------------------------------------------------------
// What "risky" covered, in words, from the scenario categories the run really had.
// ---------------------------------------------------------------------------------------------------------------------

/** In the order a visitor should meet them; one phrase can stand for several categories. */
const RISK_PHRASES: readonly { readonly categories: readonly string[]; readonly words: LabelPair }[] = [
  { categories: ["shipping_overflow", "fees"], words: label("going over the budget", "超出預算") }, // NEEDS-REVIEW zh-HK
  { categories: ["injected_text", "padded_listing"], words: label("listings that try to give Wally orders", "想指揮 Wally 的商品頁") }, // NEEDS-REVIEW zh-HK
  { categories: ["flagged_seller"], words: label("a seller on the flagged-seller list", "在賣家名單上被標記的賣家") }, // NEEDS-REVIEW zh-HK
  { categories: ["wrong_merchant"], words: label("the wrong shop", "錯誤的商店") }, // NEEDS-REVIEW zh-HK
  { categories: ["replay", "duplicate"], words: label("a card used twice", "一張卡用兩次") }, // NEEDS-REVIEW zh-HK
  { categories: ["price_drift"], words: label("a price that changes at checkout", "結帳時價格改變") }, // NEEDS-REVIEW zh-HK
  { categories: ["velocity_burst"], words: label("too many cards too fast", "短時間內發太多卡") }, // NEEDS-REVIEW zh-HK
  { categories: ["revoked", "expired"], words: label("a cancelled or ended budget", "已取消或已到期的預算") }, // NEEDS-REVIEW zh-HK
  { categories: ["off_category"], words: label("something your rules do not allow", "規則不容許的東西") }, // NEEDS-REVIEW zh-HK
  { categories: ["rail_timeout"], words: label("a payment that times out", "付款逾時") }, // NEEDS-REVIEW zh-HK
];

const MOST_KINDS = 5;

/** "They included a, b and c." from the categories present; null when none has words. */
export function riskyKindsSentence(categories: readonly string[]): LabelPair | null {
  const picked = RISK_PHRASES.filter((p) => p.categories.some((c) => categories.includes(c))).slice(0, MOST_KINDS);
  if (picked.length === 0) return null;
  const last = picked.length - 1;
  const en = picked.map((p) => p.words.en);
  const zh = picked.map((p) => p.words.zh);
  const joinEn = last === 0 ? en[0] : `${en.slice(0, last).join(", ")} and ${en[last]}`;
  const joinZh = last === 0 ? zh[0] : `${zh.slice(0, last).join("、")}及${zh[last]}`; // NEEDS-REVIEW zh-HK
  return label(`They included ${joinEn}.`, `包括：${joinZh}。`); // NEEDS-REVIEW zh-HK
}

// ---------------------------------------------------------------------------------------------------------------------
// The chip, in plain words, and what it means when tapped.
// ---------------------------------------------------------------------------------------------------------------------

export function chipLabel(kind: ChipKind, n: number | null): LabelPair {
  switch (kind) {
    case "MEASURED":
      return n === null
        ? label("Measured on our own scripted test purchases, in a simulated shop", "在模擬商店中，以我們自己的腳本測試購買量度") // NEEDS-REVIEW zh-HK
        : label(`Measured on ${n} scripted test purchases, in a simulated shop`, `在模擬商店中，以 ${n} 宗腳本測試購買量度`); // NEEDS-REVIEW zh-HK
    case "RECORDED":
      return n === null
        ? label("Replayed from a recording of our own scripted test purchases, in a simulated shop", "在模擬商店中，重播我們自己的腳本測試購買的錄製答案") // NEEDS-REVIEW zh-HK
        : label(`Replayed from a recording of ${n} scripted test purchases, in a simulated shop`, `在模擬商店中，重播 ${n} 宗腳本測試購買的錄製答案`); // NEEDS-REVIEW zh-HK
    case "ASSUMED": return label("Assumed", "假設值"); // NEEDS-REVIEW zh-HK
    case "OBSERVED": return label("Observed", "實地觀察"); // NEEDS-REVIEW zh-HK
    case "SIMULATED": return label("Simulated", "模擬"); // NEEDS-REVIEW zh-HK
  }
}

export function chipDetails(kind: ChipKind): LabelPair {
  switch (kind) {
    case "MEASURED":
      return label(
        "Measured means we counted the results ourselves, on our own test set: made-up shoppers buying in a simulated shop. No real shop, card or money was involved, and a different set of purchases could give different numbers.",
        "「量度」指我們自己在我們的測試中數出結果：虛構的購物者在模擬商店購物。過程沒有真實商店、卡或金錢，換一批購買可能得出不同數字。", // NEEDS-REVIEW zh-HK
      );
    case "RECORDED":
      return label(
        "Replayed means the AI's answers were recorded earlier and played back, so this run did not ask the AI again. The rest ran for real on our own test set, in a simulated shop with no real money. A different set of purchases could give different numbers.",
        "「重播」指 AI 的答案早前已錄下並重新播放，所以今次運行沒有再問 AI。其餘部分在我們自己的測試中真實運行，商店為模擬，沒有真錢。換一批購買可能得出不同數字。", // NEEDS-REVIEW zh-HK
      );
    case "ASSUMED":
      return label("Assumed means this is our own setting or guess, not something we measured.", "「假設」指這是我們自己的設定或估計，並非量度所得。"); // NEEDS-REVIEW zh-HK
    case "OBSERVED":
      return label("Observed means someone saw it on a real page and wrote it down.", "「實地觀察」指有人在真實網頁看到並記錄下來。"); // NEEDS-REVIEW zh-HK
    case "SIMULATED":
      return label("Simulated means made up for practice: no real shop, card or money.", "「模擬」指為練習而虛構：沒有真實商店、卡或金錢。"); // NEEDS-REVIEW zh-HK
  }
}
