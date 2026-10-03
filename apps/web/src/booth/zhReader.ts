// The common Chinese ways to say a budget, for the fixed rules parser (compile.ts, no model): the amount (HK$800, $800, 港幣800,
// 800蚊, 八百蚊, 一千二), how long (未來14日, 14日內, 兩星期內), what it buys (衫, 鞋, 電子產品, 雜貨), which sellers (已驗證賣家,
// 任何賣家) and the limits (超過HK$300要問我, 單次最多HK$200). Pure functions over the sentence; each returns nothing when it is
// not sure, so a sentence that does not say it falls back to the same defaults the English reader has (fail closed).
// A date such as 十月尾 or 10月31日前 is not read here: endDate.ts does that.
import { dollarsToMinor } from "../domain/money";

export interface Amount {
  readonly minor: number;
  /** Where the amount starts and ends in the sentence. */
  readonly at: number;
  readonly end: number;
}

const ZH_DIGIT: Readonly<Record<string, number>> = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const ZH_UNIT: Readonly<Record<string, number>> = { 十: 10, 百: 100, 千: 1000 };
const ZH_NUM = "[零〇一二兩两三四五六七八九十廿卅百千萬万]+";
const NUM_CHARS = new RegExp(`^${ZH_NUM}$`);

/** A number below ten thousand written in Chinese: 八百, 二千五百, 十二, 廿五; and the spoken short forms 一千二 (1200), 三百五 (350). */
function section(text: string): number | null {
  let total = 0;
  let pending: number | null = null;
  let lastUnit = 0;
  let zero = false;
  for (const ch of text) {
    const digit = ZH_DIGIT[ch];
    const unit = ZH_UNIT[ch];
    if (ch === "零" || ch === "〇") {
      zero = true;
    } else if (digit !== undefined) {
      if (pending !== null) return null; // two digits in a row is a year or a code, not an amount
      pending = digit;
    } else if (unit !== undefined) {
      if (pending === null && ch !== "十") return null;
      total += (pending ?? 1) * unit;
      pending = null;
      lastUnit = unit;
      zero = false;
    } else if (ch === "廿" || ch === "卅") {
      if (pending !== null) return null;
      total += ch === "廿" ? 20 : 30;
      lastUnit = 10;
    } else {
      return null;
    }
  }
  if (pending !== null) total += lastUnit > 1 && !zero ? pending * (lastUnit / 10) : pending;
  return total;
}

/** A whole number written in Chinese, up to the tens of thousands: 八百, 二千五百, 一萬, 兩萬五, 廿. Null when it is not one. */
export function zhInteger(text: string): number | null {
  if (!NUM_CHARS.test(text)) return null;
  const wan = Math.max(text.indexOf("萬"), text.indexOf("万"));
  if (wan === -1) return section(text);
  const left = wan === 0 ? 1 : section(text.slice(0, wan));
  const rest = text.slice(wan + 1);
  const right = rest === "" ? 0 : section(rest);
  if (left === null || right === null) return null;
  // 兩萬五 is 25000: a lone digit after 萬 counts thousands.
  const tail = rest.length === 1 && ZH_DIGIT[rest] !== undefined && ZH_DIGIT[rest] !== 0 ? right * 1000 : right;
  return left * 10_000 + tail;
}

/** A count written with digits or Chinese numerals: 14, 十四, 兩. */
function count(text: string): number | null {
  return /^\d{1,3}$/.test(text) ? Number.parseInt(text, 10) : zhInteger(text);
}

// ---- amounts ----

const DIGITS = "\\d[\\d,]*(?:\\.\\d{1,2})?";
/** Written after the number: 蚊, 元, 塊, 港幣, 港元, 港紙. */
const SUFFIX = "(?:蚊|元|塊|块|港幣|港币|港元|港紙|港纸|HKD)";
/** Written before the number: HK$, HKD, $, 港幣, 港元. A $ with a letter in front of it (US$) is not Hong Kong money. */
const PREFIX = "(?:HK\\s?\\$|HKD|(?<![A-Za-z])\\$|(?:港幣|港币|港元)\\s?\\$?)";
const AMOUNT_FORMS: readonly RegExp[] = [
  new RegExp(`${PREFIX}\\s?(${DIGITS})`, "gi"),
  new RegExp(`(${DIGITS})\\s?${SUFFIX}`, "gi"),
  new RegExp(`${PREFIX}\\s?(${ZH_NUM})`, "g"),
  new RegExp(`(${ZH_NUM})\\s?${SUFFIX}`, "g"),
];

/** Every amount in the sentence, in order, as minor units. Digits and Chinese numerals, before or after the currency word. */
export function readAmounts(text: string): readonly Amount[] {
  const found = AMOUNT_FORMS.flatMap((form) =>
    [...text.matchAll(form)].flatMap((m): readonly Amount[] => {
      const raw = m[1] ?? "";
      const dollars = /^\d/.test(raw) ? raw.replaceAll(",", "") : String(zhInteger(raw) ?? "");
      const minor = dollars === "" ? null : dollarsToMinor(dollars);
      return minor === null ? [] : [{ minor, at: m.index ?? 0, end: (m.index ?? 0) + m[0].length }];
    }),
  );
  // The same amount can be matched by two forms (HK$800蚊): keep the one that starts first and drop what overlaps it.
  const ordered = [...found].sort((a, b) => a.at - b.at || b.end - a.end);
  return ordered.filter((a, i) => ordered.slice(0, i).every((before) => a.at >= before.end));
}

// ---- limits ----

const AMOUNT_ZH = `(?:${PREFIX}\\s?(?:${DIGITS}|${ZH_NUM})|(?:${DIGITS}|${ZH_NUM})\\s?${SUFFIX})`;
const OVER = "(?:超過|超过|多過|多过|多於|多于|高過|高过|高於|高于|大於|大于|逾)";
/** "超過 HK$300 要問我", "多過300蚊就要問我": the amount above which Wally asks first. */
const ASK_CLAUSE = new RegExp(`${OVER}\\s?(${AMOUNT_ZH})[^。；;，,.]{0,6}?(?:問我|问我|確認|确认|先問|先问|詢問|询问|通知我|問一問|问一问)`, "g");
/** "單次最多 HK$200", "每次唔好超過200蚊": the most one purchase may cost. */
const CAP_CLAUSE = new RegExp(`(?:單次|单次|每次|單筆|单笔|每筆|每笔|每單|每单|一次)\\s?(?:最多|唔好超過|唔好多過|不要超過|不要超过|不超過|不超过|上限|最高|限)\\s?(${AMOUNT_ZH})`, "g");

function firstAmount(clause: string): number | null {
  return readAmounts(clause)[0]?.minor ?? null;
}

export function askAboveIn(text: string): number | null {
  const m = [...text.matchAll(ASK_CLAUSE)][0];
  return m?.[1] === undefined ? null : firstAmount(m[1]);
}

export function capIn(text: string): number | null {
  const m = [...text.matchAll(CAP_CLAUSE)][0];
  return m?.[1] === undefined ? null : firstAmount(m[1]);
}

/** The sentence with the limit clauses blanked, so the first amount left is the budget. */
export function withoutZhLimits(text: string): string {
  return text.replace(ASK_CLAUSE, (whole) => " ".repeat(whole.length)).replace(CAP_CLAUSE, (whole) => " ".repeat(whole.length));
}

// ---- how long ----

/** Weeks as days: 兩星期內, 一個星期, 2週, 三個禮拜. */
const WEEKS = new RegExp(`(\\d{1,2}|${ZH_NUM})\\s?個?\\s?(?:星期|週|周|禮拜|礼拜)(?:之?內|之?内)?`);
/** Days, only where the words say a length: 未來14日, 之後 30 天, 14日內, 為期十四日. A bare 31日 may be a date, so it is not read. */
const DAYS_AFTER_LEAD = new RegExp(`(?:未來|未来|之後|之后|往後|接下來|接下来|為期|为期|維持|维持|有效)\\s?(\\d{1,3}|${ZH_NUM})\\s?[日天]`);
const DAYS_BEFORE_IN = new RegExp(`(\\d{1,3}|${ZH_NUM})\\s?[日天]\\s?(?:之?內|之?内)`);

/** How many days the sentence says the budget lasts, or null when it names no length. */
export function zhDays(text: string): number | null {
  const weeks = WEEKS.exec(text)?.[1];
  const w = weeks === undefined ? null : count(weeks);
  if (w !== null) return w * 7;
  const days = DAYS_AFTER_LEAD.exec(text)?.[1] ?? DAYS_BEFORE_IN.exec(text)?.[1];
  return days === undefined ? null : count(days);
}

// ---- what it buys ----

const ZH_CATEGORY_WORDS: readonly (readonly [RegExp, string])[] = [
  [/衫|衣服|衣物|服飾|服饰|時裝|时装|T恤|T裇|外套|褸|衛衣|卫衣|褲|裤|裙/i, "apparel"],
  [/鞋|靴/, "footwear"],
  [/電子產品|电子产品|電子|电子|電器|电器|數碼|数码|耳機|耳机|手機|手机/, "electronics"],
  [/雜貨|杂货|日用品|超市|食品/, "groceries"],
];

export function zhCategories(text: string): readonly string[] {
  return ZH_CATEGORY_WORDS.filter(([re]) => re.test(text)).map(([, slug]) => slug);
}

// ---- which sellers ----

const ZH_ANY_SELLER = /任何賣家|任何卖家|任何商家|任何店|不限賣家|不限卖家|唔限賣家|隨便邊個賣家|唔使驗證|唔使认证|不用驗證|不用验证|無需驗證|未驗證賣家|未验证卖家/;
const ZH_VERIFIED = /已驗證|已验证|認證賣家|认证卖家|驗證賣家|验证卖家|認證商家|认证商家|只限認證|只限认证|只限驗證|只限验证/;

/** "any" only when the sentence says any seller will do; "verified" when it asks for verified ones; null when it says neither. */
export function zhSellers(text: string): "any" | "verified" | null {
  if (ZH_ANY_SELLER.test(text)) return "any";
  return ZH_VERIFIED.test(text) ? "verified" : null;
}
