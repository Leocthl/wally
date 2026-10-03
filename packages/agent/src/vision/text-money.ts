// The price limit in a typed request, in English or Traditional Chinese: "under HK$150", "black jeans under 400",
// "$150以下", "150蚊以內", "預算一百五十", "最多三百五". One whole number of Hong Kong dollars, or nothing. Text is
// untrusted: only a number next to a limit word or a currency mark is read, the number is bounded, and nothing else
// from the text survives. Plain regular expressions without look-behind (older Safari refuses to parse those) and
// without nested repeats, so a long text cannot make them slow.

/** The most a limit may be, in whole dollars [F105]: a limit above this is not a price a shopper types. */
export const MAX_LIMIT_DOLLARS = 99_999;
/** A bare amount with no limit word ("tee $120") must be at least this many dollars, so "2 dollars" or "兩塊" is not a price [F105]. */
export const MIN_BARE_DOLLARS = 20;

const DIGITS: Readonly<Record<string, number>> = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const UNITS: Readonly<Record<string, number>> = { 十: 10, 百: 100, 千: 1000 };

/** 一百五十 = 150, 三百五 = 350, 一千二 = 1200, 兩百 = 200, 十五 = 15, 二百零五 = 205, 一五零 = 150. null when it is not a number. */
export function parseChineseNumber(text: string): number | null {
  const chars = [...text];
  if (chars.length === 0 || chars.some((c) => DIGITS[c] === undefined && UNITS[c] === undefined)) return null;
  if (!chars.some((c) => UNITS[c] !== undefined)) return Number(chars.map((c) => DIGITS[c]).join("")); // one digit after another: 一五零
  let total = 0;
  let digit = 0;
  let lastUnit = 1;
  let zeroSince = false;
  for (const c of chars) {
    const unit = UNITS[c];
    if (unit === undefined) {
      digit = DIGITS[c] ?? 0;
      if (digit === 0) zeroSince = true;
      continue;
    }
    total += (digit === 0 && unit === 10 ? 1 : digit) * unit;
    digit = 0;
    lastUnit = unit;
    zeroSince = false;
  }
  // 三百五 is 350 and 一千二 is 1200 (the last digit counts one unit down), but 二百零五 is 205.
  return total + (digit > 0 && lastUnit >= 100 && !zeroSince ? (digit * lastUnit) / 10 : digit);
}

/** A written number that is the whole token: "9e99", "12e5", "1.2.3" and a digit run cut short are not read as a smaller number. */
const NUMBER = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?!\d|\.\d|e[+-]?\d)`;
const AMOUNT = String.raw`(${NUMBER}|[零〇一二兩两三四五六七八九十百千]+)\s*(k(?![a-z]))?`;
const MONEY_MARK = String.raw`(?:hk\s*\$|hkd|\$|港幣|港元)`;
const BEFORE_EN = String.raw`(?:under|below|beneath|less than|lower than|up to|upto|at most|maximum|max|within|no more than|not more than|not over|nothing over|not above|nothing above|cheaper than|budget(?: of| is| around)?|around|about)`;
const BEFORE_ZH = "(?:預算|最多|至多|不超過|唔超過|唔好貴過|唔好超過|唔好over|唔好多過|唔好高過|唔好過|平過|不要超過|低於|少於|少過|不多於|上限|限額)";
const AFTER = String.raw`(?:or less|or under|or below|or lower|or cheaper|and under|and below|and lower|at most|max|tops|以下|以內|之內|或以下|或以內|封頂|為限|內)`;

/** The limit word first: "under 400", "under HK$150", "預算一百五十", "≤ 300". */
const LIMIT_FIRST = new RegExp(String.raw`(?:(?:^|[^a-z])${BEFORE_EN}|${BEFORE_ZH}|<=|<|≤)\s*${MONEY_MARK}?\s*${AMOUNT}`, "u");
/** The limit word after: "$150 or less", "150蚊以下", "HK$150以內", "150 max". */
const LIMIT_AFTER = new RegExp(String.raw`${MONEY_MARK}?\s*${AMOUNT}\s*(?:${MONEY_MARK}|蚊|元|塊|dollars?|bucks)?\s*${AFTER}`, "u");
/** An amount with a currency mark and nothing else: "tee $120", "HK$99", "250蚊". */
const BARE_MARKED = new RegExp(String.raw`${MONEY_MARK}\s*${AMOUNT}`, "u");
const BARE_AFTER_MARK = new RegExp(String.raw`${AMOUNT}\s*(?:${MONEY_MARK}|蚊|元|塊|hk dollars?|hong kong dollars?|dollars?|bucks)`, "u");

/** Whole dollars from the captured number and its optional k, or null when it is not a usable amount. */
function dollars(raw: string | undefined, kilo: string | undefined): number | null {
  if (raw === undefined) return null;
  const base = /^[\d,.]+$/.test(raw) ? Number(raw.replaceAll(",", "")) : parseChineseNumber(raw);
  if (base === null || !Number.isFinite(base)) return null;
  // A fractional amount is cut down, never up: HK$258.99 is HK$258, and HK$0.5 is no price at all.
  const value = kilo === undefined ? Math.floor(base) : Math.round(base * 1_000);
  return value >= 1 && value <= MAX_LIMIT_DOLLARS ? value : null;
}

/** A currency mark or unit in the matched words or just after them: HK$, HKD, $, 港幣, 蚊, 元, 塊, dollars, bucks. */
const MONEY_WORD = /hk\s*\$|hkd|\$|港幣|港元|蚊|元|塊|dollars?|bucks/;
/** How far past the matched words a money word still belongs to the amount ("under 5 dollars"). */
const MONEY_WORD_REACH = 12;

/** The price limit in minor units (cents), or null when the text names none. */
export function readPriceLimit(text: string): number | null {
  const lower = text.normalize("NFKC").toLowerCase();
  for (const pattern of [LIMIT_FIRST, LIMIT_AFTER]) {
    const hit = pattern.exec(lower);
    const value = hit === null ? null : dollars(hit[1], hit[2]);
    // A small number with no money word is a count or a length of time ("within 3 days", "up to 5 tees"), not a price.
    if (value !== null && hit !== null && (value >= MIN_BARE_DOLLARS || MONEY_WORD.test(lower.slice(hit.index, hit.index + hit[0].length + MONEY_WORD_REACH)))) return value * 100;
  }
  for (const pattern of [BARE_MARKED, BARE_AFTER_MARK]) {
    const hit = pattern.exec(lower);
    const value = hit === null ? null : dollars(hit[1], hit[2]);
    if (value !== null && value >= MIN_BARE_DOLLARS) return value * 100;
  }
  return null;
}
