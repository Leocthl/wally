// The date a budget ends on, read out of a sentence for the fixed rules parser (compile.ts, no model). Only a date that an
// end word introduces counts ("until 31 Oct", "by 2026-10-31", "10月31日前"), or the end of a month ("end of November",
// "十月底"). A date that merely sits in the sentence, belongs to a seller (ships by, sale until) or competes with another
// date sets nothing. The year is never read: a date means its next occurrence (@laisee/agent/compiler resolves and caps it).
import { isRealDate, type EndDate } from "@laisee/agent/compiler";

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
/** Words that say the budget ends there. "to" and "ends" are left out: "from 1 Oct to 31 Oct" and "sale ends 31 Oct" are not an end. */
const END_WORD = "(?:until|till|til|by|before|through|thru|up to|no later than|on or before)";
const LEAD = `\\b${END_WORD}\\s+(?:the\\s+)?`;
const DAY = "(\\d{1,2})(?:st|nd|rd|th)?";
const YEAR = "(?:,?\\s+\\d{4})?";

const EN_DAY_MONTH = new RegExp(`${LEAD}${DAY}\\s+(?:of\\s+)?${MONTH}\\b${YEAR}`, "gi");
const EN_MONTH_DAY = new RegExp(`${LEAD}${MONTH}\\.?\\s+${DAY}\\b${YEAR}`, "gi");
const EN_ISO = new RegExp(`${LEAD}(\\d{4})-(\\d{1,2})-(\\d{1,2})\\b`, "gi");
const EN_END_OF = new RegExp(`\\bend\\s+of\\s+(?:the\\s+)?(?:month\\s+of\\s+)?${MONTH}\\b`, "gi");

/** Words in front of a date that make it a seller's date: shipping, a sale, a return window, a release. */
const LISTING_WORD = /^(?:ship\w*|deliver\w*|arriv\w*|dispatch\w*|order\w*|return\w*|refund\w*|sales?|offers?|promo\w*|discount\w*|deals?|launch\w*|releas\w*|warrant\w*|pre-?orders?)$/i;
/** End words and fillers that can sit between a seller's word and the date ("free returns until the end of ..."). */
const FILLER = new Set(["until", "till", "til", "by", "before", "through", "thru", "up", "to", "no", "later", "than", "on", "or", "the", "of"]);

const ZH_MONTH = "(\\d{1,2}|[一二三四五六七八九十]{1,3})";
const ZH_DAY = "(\\d{1,2}|[廿卅一二三四五六七八九十]{1,3})";
const ZH_DATE = new RegExp(`(?:\\d{4}年)?${ZH_MONTH}月${ZH_DAY}[日號号]`, "g");
const ZH_MONTH_END = new RegExp(`${ZH_MONTH}月(?:底|尾|末)`, "g");
const ZH_BEFORE = /(?:直到|直至|截至|去到|至|到)\s*$/;
const ZH_AFTER = /^\s*(?:之前|以前|前|為止|为止|截止|止)/;
const ZH_LISTING = /優惠|特價|減價|折扣|促銷|發售|發貨|发货|送貨|送货|送到|送達|送达|到貨|到货|退貨|退货|保養|保养|保用|預訂|預購|訂購|開售|上架|限時/;
const ZH_WINDOW = 6;
const ZH_DIGITS: Readonly<Record<string, number>> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const ZH_NUMBER = /^(?:([一二三四五六七八九])?(十)|(廿)|(卅))?([一二三四五六七八九])?$/;

/** 1 to 99 from digits or Chinese numerals (十二, 二十五, 廿五, 卅一), or null. */
function zhNumber(text: string): number | null {
  if (/^\d{1,2}$/.test(text)) return Number.parseInt(text, 10);
  const m = ZH_NUMBER.exec(text);
  if (text === "" || m === null) return null;
  const tens = m[3] ? 2 : m[4] ? 3 : m[2] ? (m[1] ? (ZH_DIGITS[m[1]] ?? 0) : 1) : 0;
  return tens * 10 + (m[5] ? (ZH_DIGITS[m[5]] ?? 0) : 0);
}

const words = (text: string): string[] => text.split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);

/** True when a seller's word stands in front of the date (the last two words before it, end words and fillers aside). */
function sellersDate(before: string): boolean {
  const all = words(before.toLowerCase());
  while (all.length > 0 && FILLER.has(all[all.length - 1] ?? "")) all.pop();
  return all.slice(-2).some((w) => LISTING_WORD.test(w));
}

function englishDates(text: string): EndDate[] {
  const out: EndDate[] = [];
  const add = (m: RegExpMatchArray, month: string | undefined, day: string | undefined): void => {
    if (sellersDate(text.slice(0, m.index ?? 0))) return;
    out.push({ month: MONTHS[(month ?? "").toLowerCase()] ?? Number(month), day: day === undefined ? null : Number.parseInt(day, 10) });
  };
  for (const m of text.matchAll(EN_DAY_MONTH)) add(m, m[2], m[1]);
  for (const m of text.matchAll(EN_MONTH_DAY)) add(m, m[1], m[2]);
  for (const m of text.matchAll(EN_ISO)) add(m, m[2], m[3]);
  for (const m of text.matchAll(EN_END_OF)) add(m, m[1], undefined);
  return out;
}

function chineseDates(text: string): EndDate[] {
  const out: EndDate[] = [];
  const sellers = (m: RegExpMatchArray): boolean => {
    const start = m.index ?? 0;
    return ZH_LISTING.test(text.slice(Math.max(0, start - ZH_WINDOW), start) + text.slice(start + m[0].length, start + m[0].length + ZH_WINDOW));
  };
  for (const m of text.matchAll(ZH_DATE)) {
    const start = m.index ?? 0;
    const marked = ZH_BEFORE.test(text.slice(0, start)) || ZH_AFTER.test(text.slice(start + m[0].length));
    const month = zhNumber(m[1] ?? "");
    const day = zhNumber(m[2] ?? "");
    if (marked && !sellers(m) && month !== null && day !== null) out.push({ month, day });
  }
  for (const m of text.matchAll(ZH_MONTH_END)) {
    const month = zhNumber(m[1] ?? "");
    if (!sellers(m) && month !== null) out.push({ month, day: null });
  }
  return out;
}

/**
 * The one date the sentence says the budget ends on, or null: none named, a date that is not on the calendar, or more
 * than one different date (then no date is guessed).
 */
export function readEndDate(sentence: string): EndDate | null {
  const text = sentence.normalize("NFKC");
  const found = [...englishDates(text), ...chineseDates(text)];
  const first = found[0];
  if (first === undefined || !found.every((d) => d.month === first.month && d.day === first.day)) return null;
  return isRealDate(first) ? first : null;
}
