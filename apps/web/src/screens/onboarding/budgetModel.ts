// The first budget as a form (pure). A preset or a typed amount, this month / two weeks / a date, what Wally can buy and
// whether sellers must be verified become the Seal screen's own RulesForm, so the same checks and the same SealRequest
// apply and nothing here seals. The sentence that is signed with the rules is written from the form and reads back to the
// same rules through the booth's reader (a test holds that). Amounts: HK$800 is the booth's ready-made budget [F20]; the
// others are choices a visitor can change (as in screens/seal/examples.ts).
import { DEFAULT_COMPILER_LIMITS } from "@wally/agent/compiler";
import { formatHkd } from "../../domain/money";
import type { Profile } from "../../state/profile";
import { CATEGORY_SLUGS, hkDay, moneyOf, monthEndDay, type RulesForm } from "../seal/sealModel";
import type { Locale } from "../../ui/locale";

export const PRESETS_HKD = [300, 500, 800, 1200] as const;
export type Preset = (typeof PRESETS_HKD)[number];

export const HOW_LONG = ["month", "twoWeeks", "date"] as const;
export type HowLong = (typeof HOW_LONG)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_WEEKS_DAYS = 14;
/** The date option opens a week out. */
const DATE_DEFAULT_DAYS = 7;
/** The longest a budget may run (the compiler's limit, the one the Seal sentence reader cuts to). */
const MAX_DAYS = DEFAULT_COMPILER_LIMITS.maxPeriodDays;

export interface BudgetDraft {
  readonly amount: Preset | "custom";
  /** The typed amount, as typed, without the HK$ sign. Used when `amount` is "custom". */
  readonly custom: string;
  readonly howLong: HowLong;
  /** YYYY-MM-DD, a day in Hong Kong. Used when `howLong` is "date". */
  readonly date: string;
  /** Engine category slugs. */
  readonly categories: readonly string[];
  readonly verifiedOnly: boolean;
}

const dayAfter = (now: Date, days: number): string => hkDay(new Date(now.getTime() + days * DAY_MS).toISOString());

/** The latest day a budget may run to, from now. */
export function maxDay(now: Date): string {
  return dayAfter(now, MAX_DAYS);
}

/** A date cut to the longest a budget may run; `capped` says it was cut (Seal words that as "Until is set to the latest day"). */
export function capUntil(day: string, now: Date): { readonly day: string; readonly capped: boolean } {
  const latest = maxDay(now);
  return day > latest ? { day: latest, capped: true } : { day, capped: false };
}

/** Groceries are the small budget, shoes the middle one, anything else (or a mix) the booth's ready-made HK$800. */
export function presetFor(profile: Profile | null): Preset {
  const shop = profile?.shopFor ?? [];
  if (shop.length === 1 && shop[0] === "groceries") return 300;
  if (shop.length === 1 && shop[0] === "footwear") return 500;
  return 800;
}

/** The form a first budget starts from: the person's categories if they gave any, otherwise clothes like the ready-made budget. */
export function draftFor(profile: Profile | null, now: Date): BudgetDraft {
  const shop = profile?.shopFor ?? [];
  return { amount: presetFor(profile), custom: "", howLong: "month", date: dayAfter(now, DATE_DEFAULT_DAYS), categories: shop.length > 0 ? shop : ["apparel"], verifiedOnly: true };
}

/** The day the choice ends on, and whether a typed date had to be cut. */
export function untilOf(draft: BudgetDraft, now: Date): { readonly day: string; readonly capped: boolean } {
  if (draft.howLong === "month") return { day: monthEndDay(now), capped: false };
  if (draft.howLong === "twoWeeks") return { day: dayAfter(now, TWO_WEEKS_DAYS), capped: false };
  return capUntil(draft.date, now);
}

const inSealOrder = (slugs: readonly string[]): readonly string[] => CATEGORY_SLUGS.filter((s) => slugs.includes(s));

export function formOf(draft: BudgetDraft, now: Date): RulesForm {
  return {
    amount: draft.amount === "custom" ? draft.custom : String(draft.amount),
    categories: inSealOrder(draft.categories),
    verifiedOnly: draft.verifiedOnly,
    until: untilOf(draft, now).day,
    askAbove: null,
    cap: null,
    share: null,
  };
}

// ---- the sentence that is signed with the rules ----

const THINGS = {
  en: { apparel: "clothes", footwear: "shoes", electronics: "electronics", groceries: "groceries" },
  zh: { apparel: "衫", footwear: "鞋", electronics: "電子產品", groceries: "雜貨" },
} as const;
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function thingsText(slugs: readonly string[], locale: Locale): string {
  const words = slugs.map((s) => (THINGS[locale === "zh-HK" ? "zh" : "en"] as Readonly<Record<string, string>>)[s] ?? s);
  if (locale === "zh-HK") return words.join("、");
  const last = words.at(-1);
  return words.length < 2 || last === undefined ? words.join("") : `${words.slice(0, -1).join(", ")} and ${last}`;
}

function endPhrase(until: string, locale: Locale, now: Date): { readonly kind: "month" | "weeks" | "date"; readonly text: string } {
  if (until === monthEndDay(now)) return { kind: "month", text: "" };
  if (until === dayAfter(now, TWO_WEEKS_DAYS)) return { kind: "weeks", text: "" };
  const [, month = "1", day = "1"] = until.split("-");
  const m = Number.parseInt(month, 10);
  const d = Number.parseInt(day, 10);
  return { kind: "date", text: locale === "zh-HK" ? `${m}月${d}日前` : `until ${d} ${MONTHS_EN[m - 1] ?? ""}` };
}

/** The budget in the person's own kind of words, in the screen's language. The credential keeps it as the signed words. */
export function sentenceFor(form: RulesForm, locale: Locale, now: Date): string {
  const minor = moneyOf(form.amount) ?? 0;
  const amount = formatHkd(minor);
  const things = thingsText(form.categories, locale);
  const end = endPhrase(form.until, locale, now);
  if (locale === "zh-HK") {
    const sellers = form.verifiedOnly ? "，只限認證賣家" : "，任何賣家都得";
    if (end.kind === "month") return `今個月 ${amount} 買${things}${sellers}`;
    if (end.kind === "weeks") return `未來 ${TWO_WEEKS_DAYS} 日用 ${amount} 買${things}${sellers}`;
    return `${amount} 買${things}，${end.text}${sellers}`;
  }
  const sellers = form.verifiedOnly ? ", verified sellers only" : ", any seller";
  if (end.kind === "month") return `${amount} this month for ${things}${sellers}`;
  if (end.kind === "weeks") return `${amount} for ${things} over the next ${TWO_WEEKS_DAYS} days${sellers}`;
  return `${amount} for ${things} ${end.text}${sellers}`;
}
