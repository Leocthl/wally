// The sentences under each plain card, from the counts of what each layer did: rules only (the hard rules R1-R8 and R12
// with the card limit: no seller check, no listing check) and Wally (the same plus the seller check and the listing check). Templates only, EN and zh-HK (drafts for the native
// read). A sentence says what the counts say and no more: a zero is always followed by the limit it could still hide, the
// listing check is credited only where the counts show it adds something, and its cost is said as plainly as its gain.
import { label, type LabelPair } from "../i18n/label";
import { sentence, shareOf, tenthsWords, throughClause, zeroLimit, secondsOf, type Sentence, type Share } from "./explainPlain";
import type { Count } from "./judgeFit";

/** Wally's counts and, when the file carries them, those of rules only. What a count counts depends on the card. */
export interface Layers {
  readonly wally: Count;
  readonly rules: Count | null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Went over the limit. Counts are the purchases that went over.
// ---------------------------------------------------------------------------------------------------------------------

function compareOver(wally: Count, rules: Count): Sentence {
  const { k: w } = wally;
  const { k: r } = rules;
  if (r === 0 && w === 0) {
    return sentence(label(
      "Rules alone already stop this. Rules only and Wally both had none, so the listing check adds nothing here.",
      "單靠規則已能攔住：只用規則和用 Wally 都是零宗，所以商品檢查在這方面沒有額外作用。", // NEEDS-REVIEW zh-HK
    ));
  }
  if (r === 0) return sentence(label("Rules only had none go over the limit; Wally had {w}.", "只用規則沒有任何一宗超出上限；Wally 有 {w} 宗。"), { w }); // NEEDS-REVIEW zh-HK
  if (w === 0) return sentence(label("Rules only had {r} go over the limit; Wally had none.", "只用規則有 {r} 宗超出上限；Wally 沒有。"), { r }); // NEEDS-REVIEW zh-HK
  if (r === w) return sentence(label("Rules only and Wally both had {k} go over the limit.", "只用規則和用 Wally 都有 {k} 宗超出上限。"), { k: w }); // NEEDS-REVIEW zh-HK
  return sentence(label("Rules only had {r} go over the limit; Wally had {w}.", "只用規則有 {r} 宗超出上限；Wally 有 {w} 宗。"), { r, w }); // NEEDS-REVIEW zh-HK
}

export function limitSentences({ wally, rules }: Layers): readonly Sentence[] {
  if (wally.n === 0) return [];
  const zero = wally.k === 0 ? [zeroLimit("limit", wally.n)] : [];
  if (rules !== null) return [compareOver(wally, rules), ...zero];
  const head = wally.k === 0
    ? sentence(label("Not one purchase went over the budget or the card limit.", "沒有任何一宗購買超出預算或卡的上限。")) // NEEDS-REVIEW zh-HK
    : sentence(label("{k} of {n} purchases went over the limit.", "{n} 宗購買中有 {k} 宗超出上限。"), { k: wally.k, n: wally.n }); // NEEDS-REVIEW zh-HK
  return [head, ...zero];
}

// ---------------------------------------------------------------------------------------------------------------------
// Stopped before paying. Counts are the risky purchases that were stopped.
// ---------------------------------------------------------------------------------------------------------------------

const WALLY = label("Wally", "Wally");
const RULES_ALONE = label("Rules alone", "單靠規則"); // NEEDS-REVIEW zh-HK

/** "<Who> stopped about nine in ten of them." */
function stoppedOfThem(who: LabelPair, share: Share): LabelPair {
  switch (share.kind) {
    case "all": return label(`${who.en} stopped every one of them.`, `${who.zh}全部攔截了。`); // NEEDS-REVIEW zh-HK
    case "none": return label(`${who.en} stopped none of them.`, `${who.zh}一宗都沒有攔截。`); // NEEDS-REVIEW zh-HK
    case "nearlyAll": return label(`${who.en} stopped nearly all of them.`, `${who.zh}攔截了幾乎全部。`); // NEEDS-REVIEW zh-HK
    case "almostNone": return label(`${who.en} stopped fewer than one in twenty of them.`, `${who.zh}只攔截了不足二十分之一。`); // NEEDS-REVIEW zh-HK
    case "tenths": {
      const w = tenthsWords(share);
      return label(`${who.en} stopped ${w.en} of them.`, `${who.zh}攔截了${w.zh}。`); // NEEDS-REVIEW zh-HK
    }
  }
}

export function riskySentences({ wally, rules }: Layers): readonly Sentence[] {
  const shareW = shareOf(wally);
  if (shareW === null) return [];
  const shareR = rules === null ? null : shareOf(rules);
  return [
    sentence(stoppedOfThem(WALLY, shareW)),
    ...(shareR === null ? [] : [sentence(stoppedOfThem(RULES_ALONE, shareR))]),
    ...(wally.k === wally.n ? [zeroLimit("risky", wally.n)] : []),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Trick listings: the ones no fixed rule would stop. Counts are the trick listings that were stopped.
// ---------------------------------------------------------------------------------------------------------------------

export const TRICKS_NOTE = label(
  "These are trick listings that no fixed rule would stop, so only the listing check can.",
  "這些陷阱商品頁沒有任何固定規則攔得住，只有商品檢查可以。", // NEEDS-REVIEW zh-HK
);

function rulesLetThrough(rules: Count): Sentence {
  const through = rules.n - rules.k;
  if (through === rules.n) return sentence(label("Rules alone let every one of them through.", "單靠規則，全部都漏網了。")); // NEEDS-REVIEW zh-HK
  if (through === 0) return sentence(label("Rules alone stopped every one of them.", "單靠規則也全部攔截了。")); // NEEDS-REVIEW zh-HK
  return sentence(label("Rules alone let {r} of {n} through.", "單靠規則，{n} 個中有 {r} 個漏網。"), { r: through, n: rules.n }); // NEEDS-REVIEW zh-HK
}

/** Wally's own line when it let some through (the none case is the zero-limit sentence). */
function wallyLetThrough(wally: Count): Sentence {
  const through = wally.n - wally.k;
  if (through === wally.n) return sentence(label("Wally let every one through.", "Wally 讓全部都漏網了。")); // NEEDS-REVIEW zh-HK
  return sentence(label("Wally let {w} of {n} through.", "Wally 讓 {n} 個中有 {w} 個漏網。"), { w: through, n: wally.n }); // NEEDS-REVIEW zh-HK
}

export function tricksSentences({ wally, rules }: Layers): readonly Sentence[] {
  if (wally.n === 0) return [];
  return [
    ...(rules === null || rules.n === 0 ? [] : [rulesLetThrough(rules)]),
    // When Wally let none through, the sentence that says so also carries the limit that zero could hide.
    wally.k === wally.n ? zeroLimit("tricks", wally.n) : wallyLetThrough(wally),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Approved. Counts are the honest purchases that went through; the rest were blocked by mistake.
// ---------------------------------------------------------------------------------------------------------------------

function rulesBlocked(blocked: number, wallyBlocked: number): Sentence {
  const adds = wallyBlocked > blocked;
  const tail = adds ? { en: " The listing check adds some false alarms.", zh: "商品檢查帶來了一些誤報。" } : { en: "", zh: "" }; // NEEDS-REVIEW zh-HK
  if (blocked === 0) return sentence(label(`Rules only blocked none by mistake.${tail.en}`, `只用規則沒有錯誤攔截任何一宗。${tail.zh}`)); // NEEDS-REVIEW zh-HK
  return sentence(label(`Rules only blocked {r} by mistake.${tail.en}`, `只用規則錯誤攔截了 {r} 宗。${tail.zh}`), { r: blocked }); // NEEDS-REVIEW zh-HK
}

export function honestSentences({ wally, rules }: Layers): readonly Sentence[] {
  const share = shareOf(wally);
  if (share === null) return [];
  const blocked = wally.n - wally.k;
  const head = blocked === 0
    ? sentence(label("Wally let every honest purchase through.", "Wally 讓每一宗正常購買順利完成。")) // NEEDS-REVIEW zh-HK
    : (() => {
        const clause = throughClause(share, false);
        return sentence(label(`${clause.en} and blocked {b} by mistake.`, `${clause.zh}，錯誤攔截了 {b} 宗。`), { b: blocked }); // NEEDS-REVIEW zh-HK
      })();
  return [
    head,
    ...(rules === null || rules.n === 0 ? [] : [rulesBlocked(rules.n - rules.k, blocked)]),
    ...(blocked === 0 ? [zeroLimit("blocked", wally.n)] : []),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Speed.
// ---------------------------------------------------------------------------------------------------------------------

export interface SpeedFacts {
  readonly typicalMs: number;
  readonly nearlyAllMs: number;
  /** Typical time of rules only, when the file measured it. */
  readonly rulesTypicalMs: number | null;
}

export function speedSentences({ typicalMs, nearlyAllMs, rulesTypicalMs }: SpeedFacts): readonly Sentence[] {
  const nearly = sentence(label("Nearly every decision took under {slow} seconds.", "幾乎每個決定都在 {slow} 秒內完成。"), { slow: secondsOf(nearlyAllMs) }); // NEEDS-REVIEW zh-HK
  if (rulesTypicalMs === null || rulesTypicalMs >= typicalMs) return [nearly];
  return [nearly, sentence(label("Rules alone are faster: reading the listing is what takes the time.", "只用規則較快：閱讀商品頁才是花時間的地方。"))]; // NEEDS-REVIEW zh-HK
}

// ---------------------------------------------------------------------------------------------------------------------
// Where Wally still gets it wrong.
// ---------------------------------------------------------------------------------------------------------------------

/** `blocked` is the honest purchases Wally blocked, out of all the honest ones. */
export function falseAlarmBullet({ k, n }: Count): Sentence {
  if (k > 0) return sentence(label("Wally blocked {k} of {n} honest purchases by mistake.", "Wally 錯誤攔截了 {n} 宗正常購買中的 {k} 宗。"), { k, n }); // NEEDS-REVIEW zh-HK
  const zero = zeroLimit("blocked", n);
  return sentence(
    label("No honest purchase was blocked by mistake in this run, but the true rate could still be up to about {x} in a hundred.", "今次運行沒有錯誤攔截任何正常購買，但真實比率仍可能高達約每一百宗有 {x} 宗。"), // NEEDS-REVIEW zh-HK
    zero.slots,
  );
}

const ONE_LAYER_EN = "It is only one layer: the budget limit and the card limit do not depend on it.";
const ONE_LAYER_ZH = "它只是其中一層：預算上限和卡的上限並不依賴它。"; // NEEDS-REVIEW zh-HK

/** The listing check judged alone on made-up trick listings, with what stands behind it. */
export function judgeMissSentence({ k, n }: Count): Sentence {
  if (k === 0) {
    return sentence(label(`On its own, Wally's listing check caught all {n} made-up trick listings. ${ONE_LAYER_EN}`, `單靠 Wally 的商品檢查，已攔下全部 {n} 個虛構的陷阱商品頁。${ONE_LAYER_ZH}`), { n }); // NEEDS-REVIEW zh-HK
  }
  return sentence(label(`On its own, Wally's listing check missed {k} of {n} made-up trick listings. ${ONE_LAYER_EN}`, `單靠 Wally 的商品檢查，{n} 個虛構的陷阱商品頁中漏了 {k} 個。${ONE_LAYER_ZH}`), { k, n }); // NEEDS-REVIEW zh-HK
}

/** The footnote under the cards. */
export function practiceSentence(): Sentence {
  return sentence(label(
    "All of this comes from our own scripted test purchases in a simulated shop, with simulated cards and no real money. Real shops can behave differently.",
    "以上全部來自我們自己的腳本測試購買：模擬商店、模擬卡，沒有真錢。真實商店的表現可能不同。", // NEEDS-REVIEW zh-HK
  ));
}
