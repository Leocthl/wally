// The language gate: which listings the typed judge is asked to read. Laya's checkpoint is English-derived (F26, risk
// register "Chinese listings"). An ordinary Chinese listing scored about 0.63 injection risk against the 0.39 limit
// [F36], so every one of them was stopped as "the listing tries to give orders": a false accusation of the seller.
// A listing whose letters are at least CJK_SHARE_PERCENT CJK is therefore not sent to the model at all. The adapter
// answers ERROR with the language marker (@wally/core/ports), R10 escalates it (R10.unavailable, I5) and the
// explanation says the checker reads English best. That can only turn an approval into a question for the shopper
// (I3); it never approves anything.
//
// What counts as CJK: Han, Hiragana, Katakana, Hangul and Bopomofo, by Script_Extensions so that the kana prolonged
// sound mark and the like count with their script. Other non-Latin scripts (Cyrillic, Arabic, Thai) are NOT covered:
// they still go to the model, and that is a known gap, not a claim of support.
import { CJK_SHARE_PERCENT } from "./config";
import { modelText } from "./state";

const LETTER = /^\p{L}$/u;
const CJK_LETTER = /^[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}]$/u;

export interface LetterCounts {
  /** Letters of any script. Digits, punctuation, symbols, emoji and blanks are not letters. */
  readonly letters: number;
  /** The letters among them that are CJK. */
  readonly cjk: number;
}

/**
 * Letter counts of the text as the model would read it: after modelText, so fullwidth Latin letters are Latin
 * (NFKC), halfwidth katakana are katakana, and zero-width and bidi characters are gone. One pass, by code point.
 */
export function cjkLetterCounts(listingText: string): LetterCounts {
  let letters = 0;
  let cjk = 0;
  for (const ch of modelText(listingText)) {
    if (!LETTER.test(ch)) continue;
    letters += 1;
    if (CJK_LETTER.test(ch)) cjk += 1;
  }
  return { letters, cjk };
}

/**
 * true when at least CJK_SHARE_PERCENT of the listing's letters are CJK. Text with no letters at all (empty, digits and
 * punctuation only) is not CJK. Integer arithmetic only, so the boundary is exact.
 */
export function isUnsupportedLanguage(listingText: string): boolean {
  const { letters, cjk } = cjkLetterCounts(listingText);
  return letters > 0 && cjk * 100 >= letters * CJK_SHARE_PERCENT;
}
