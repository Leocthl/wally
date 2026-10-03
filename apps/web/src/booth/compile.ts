// Mandate sentence -> compiled rule chips -> rules (docs/01 Example mandates, C-03). A small deterministic parser:
// no model, no network. The chips are the enforced rules; the sentence is display only (docs/06 DM1 talker line).
// The budget's end is this month's end unless the sentence gives a length ("14 days") or a date (endDate.ts); a date is
// resolved and capped by the same code the model compiler uses (@wally/agent/compiler), so both end a budget alike.
import { capEnd, DEFAULT_COMPILER_LIMITS, describeEndDate, monthEndHk, periodClamp, resolveEndDate, toTimestamp, type Clamp } from "@wally/agent/compiler";
import type { CompiledRules } from "@wally/core/generated";
import type { SealRequest } from "../api/types";
import { dollarsToMinor } from "../domain/money";
import { type Prov, SIMULATED } from "../domain/provenance";
import { addMs } from "../domain/time";
import { label, type LabelPair } from "../i18n/label";
import { readEndDate } from "./endDate";
import { askAboveIn, capIn, readAmounts, withoutZhLimits, zhCategories, zhDays, zhSellers } from "./zhReader";

export const M0_SENTENCE = "HK$800 this month for clothes, verified sellers only";

export type ChipKind = "budget" | "expiry" | "category" | "sellers" | "share" | "cap" | "askAbove";
export type RuleRef = "R2" | "R3" | "R4" | "R6" | "R9";

/** How long the budget runs: to this month's end, N days from the seal, or to a date the sentence names (a Hong Kong day, as written: `asked`). */
export type ExpiryValue =
  | { readonly kind: "expiry"; readonly mode: "month_end" }
  | { readonly kind: "expiry"; readonly mode: "days"; readonly days: number }
  | { readonly kind: "expiry"; readonly mode: "date"; readonly day: string; readonly asked: string };

export type ChipValue =
  | { readonly kind: "budget"; readonly amountMinor: number | null }
  | ExpiryValue
  | { readonly kind: "category"; readonly slugs: readonly string[] }
  | { readonly kind: "sellers"; readonly verifiedOnly: boolean }
  | { readonly kind: "share"; readonly bp: number }
  | { readonly kind: "cap"; readonly amountMinor: number }
  | { readonly kind: "askAbove"; readonly amountMinor: number };

export interface RuleChip {
  readonly kind: ChipKind;
  readonly rule: RuleRef;
  readonly label: LabelPair;
  readonly value: ChipValue;
  readonly valid: boolean;
  readonly error?: LabelPair;
  /** Typed by the delegator inside a SIMULATED demo, so the amounts carry the SIMULATED chip. */
  readonly prov: Prov;
}

export interface CompileResult {
  readonly chips: readonly RuleChip[];
  readonly issues: readonly LabelPair[];
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HKT_OFFSET_MS = 8 * HOUR_MS;
/** The longest a sentence may make a budget run [ASSUMED, compiler config]. */
const MAX_PERIOD_DAYS = DEFAULT_COMPILER_LIMITS.maxPeriodDays;
const BP_PER_WHOLE = 10_000;
/** Whole-packet share written as "half". */
const HALF_BP = 5_000;

const CATEGORY_WORDS: readonly (readonly [RegExp, string])[] = [
  [/\b(clothes|clothing|apparel|fashion|tees?|shirts?|jackets?|hoodies?)\b/i, "apparel"],
  [/\b(shoes?|sneakers?|footwear)\b/i, "footwear"],
  [/\b(electronics?|gadgets?)\b/i, "electronics"],
  [/\b(groceries|grocery)\b/i, "groceries"],
];

const money = (m: RegExpMatchArray | null, group = 1): number | null => {
  const raw = m?.[group];
  return raw ? dollarsToMinor(raw.replaceAll(",", "")) : null;
};

const MSG = {
  budgetMissing: label("No HK$ amount found. Write the budget, for example HK$800.", "找不到港幣金額。請寫明預算金額，例如 HK$800。"),
  budgetZero: label("The budget must be more than zero.", "預算金額必須大於零。"),
  categoryMissing: label("No known category. Try clothes, shoes, electronics or groceries.", "找不到已知類別。可試衣服、鞋、電子產品或雜貨。"),
  daysBad: label("Days must be a whole number of at least one.", "日數必須是至少一的整數。"),
};

function budgetChip(sentence: string): RuleChip {
  const skip = /(?:ask|confirm|check)[^.;]*?(?:above|over)\s+HK\$\s?[\d,.]+|no single purchase\s+(?:above|over)\s+HK\$\s?[\d,.]+/gi;
  // The first amount left once the limit clauses are set aside, in HK$ or in the words people say it in (800蚊, 八百蚊, 港幣800).
  const amountMinor = readAmounts(withoutZhLimits(sentence.replace(skip, " ")))[0]?.minor ?? null;
  const valid = amountMinor !== null && amountMinor > 0;
  return {
    kind: "budget", rule: "R3", label: label("Budget", "預算"), value: { kind: "budget", amountMinor }, valid, prov: SIMULATED,
    ...(valid ? {} : { error: amountMinor === 0 ? MSG.budgetZero : MSG.budgetMissing }),
  };
}

const expiry = (value: ExpiryValue, valid = true): RuleChip => ({
  kind: "expiry", rule: "R2", label: label("Expires", "到期"), value, valid, prov: SIMULATED, ...(valid ? {} : { error: MSG.daysBad }),
});

const THIS_MONTH = /\bthis\s+month\b|今個月|呢個月|這個月|这个月|本月/i;

/** The date the sentence names, unless "this month" in the same sentence ends the budget sooner. */
function statedDate(sentence: string, now: Date): { readonly endMs: number; readonly value: ExpiryValue } | null {
  const end = readEndDate(sentence);
  const resolved = end === null ? null : resolveEndDate(end, now);
  if (end === null || resolved === null) return null;
  if (THIS_MONTH.test(sentence) && resolved.endMs > Date.parse(monthEndHk(now))) return null;
  return { endMs: resolved.endMs, value: { kind: "expiry", mode: "date", day: resolved.hkDay, asked: describeEndDate(end) } };
}

/** The length a sentence gives: "14 days", or 未來14日, 14日內, 兩星期內. Null when it names none. */
function lengthInDays(sentence: string): number | null {
  const m = sentence.match(/(\d+)\s+days?/i);
  return m?.[1] ? Number.parseInt(m[1], 10) : zhDays(sentence);
}

/** Of a length and a date in one sentence the earlier end wins, so a sentence never lengthens a budget. */
function expiryChip(sentence: string, now: Date): RuleChip {
  const days = lengthInDays(sentence);
  if (days !== null && days < 1) return expiry({ kind: "expiry", mode: "days", days }, false);
  const date = statedDate(sentence, now);
  if (date !== null && (days === null || date.endMs < now.getTime() + days * DAY_MS)) return expiry(date.value);
  return expiry(days !== null ? { kind: "expiry", mode: "days", days } : { kind: "expiry", mode: "month_end" });
}

function categoryChip(sentence: string): RuleChip {
  const slugs = [...new Set([...CATEGORY_WORDS.filter(([re]) => re.test(sentence)).map(([, slug]) => slug), ...zhCategories(sentence)])];
  const valid = slugs.length > 0;
  return { kind: "category", rule: "R6", label: label("Category", "類別"), value: { kind: "category", slugs }, valid, prov: SIMULATED, ...(valid ? {} : { error: MSG.categoryMissing }) };
}

/** "any" when the sentence says any seller will do, "verified" when it asks for verified ones, null when it says neither (English or Chinese). */
export function sellerWords(sentence: string): "any" | "verified" | null {
  const zh = zhSellers(sentence);
  if (/\b(any|unverified)\s+sellers?\b/i.test(sentence) || zh === "any") return "any";
  return /\bverified\b/i.test(sentence) || zh === "verified" ? "verified" : null;
}

/** The sentence ends the budget at the month's end: "this month", 今個月, 本月. */
export function mentionsMonth(sentence: string): boolean {
  return /\bmonth\b/i.test(sentence) || THIS_MONTH.test(sentence);
}

function sellersChip(sentence: string): RuleChip {
  // Fail closed: say nothing and sellers must be verified. Only an explicit "any seller" relaxes it.
  const anySeller = sellerWords(sentence) === "any";
  return { kind: "sellers", rule: "R9", label: label("Sellers", "賣家"), value: { kind: "sellers", verifiedOnly: !anySeller }, valid: true, prov: SIMULATED };
}

function optionalChips(sentence: string): RuleChip[] {
  const chips: RuleChip[] = [];
  const share = sentence.match(/(?:no single purchase|nothing)[^.;]*?(?:above|over)\s+(half|(\d{1,3})\s?%)\s+of\s+(?:what|the)\s+(?:is\s+)?(?:left|remaining)/i);
  if (share) {
    const bp = share[1]?.toLowerCase() === "half" ? HALF_BP : Math.round((Number.parseInt(share[2] ?? "0", 10) / 100) * BP_PER_WHOLE);
    chips.push({ kind: "share", rule: "R4", label: label("Per purchase, share of what is left", "單次上限，佔餘額比例"), value: { kind: "share", bp }, valid: bp > 0 && bp <= BP_PER_WHOLE, prov: SIMULATED });
  }
  const cap = money(sentence.match(/no single purchase\s+(?:above|over)\s+HK\$\s?(\d[\d,]*(?:\.\d{1,2})?)/i)) ?? capIn(sentence);
  if (cap !== null) chips.push({ kind: "cap", rule: "R4", label: label("Per purchase cap", "單次上限"), value: { kind: "cap", amountMinor: cap }, valid: cap > 0, prov: SIMULATED });
  const ask = money(sentence.match(/(?:ask|confirm|check with)[^.;]*?(?:above|over)\s+HK\$\s?(\d[\d,]*(?:\.\d{1,2})?)/i)) ?? askAboveIn(sentence);
  if (ask !== null) chips.push({ kind: "askAbove", rule: "R4", label: label("Ask me above", "超過即詢問"), value: { kind: "askAbove", amountMinor: ask }, valid: ask > 0, prov: SIMULATED });
  return chips;
}

export function compileMandate(sentence: string, now: Date): CompileResult {
  const chips = [budgetChip(sentence), expiryChip(sentence, now), categoryChip(sentence), sellersChip(sentence), ...optionalChips(sentence)];
  return { chips, issues: chips.flatMap((c) => (c.error ? [c.error] : [])) };
}

function chipOf<K extends ChipKind>(chips: readonly RuleChip[], kind: K): Extract<ChipValue, { kind: K }> | undefined {
  return chips.find((c) => c.kind === kind)?.value as Extract<ChipValue, { kind: K }> | undefined;
}

/** Rebuilds the enforced rules from the (possibly edited) chips. Throws when a chip is invalid: Seal must stay disabled. */
export function chipsToRules(chips: readonly RuleChip[]): CompiledRules {
  if (chips.some((c) => !c.valid)) throw new Error("a rule chip is invalid, fix it before sealing (fail closed)");
  const budget = chipOf(chips, "budget")?.amountMinor;
  const slugs = chipOf(chips, "category")?.slugs ?? [];
  const [firstSlug, ...restSlugs] = slugs;
  if (budget == null || firstSlug === undefined) throw new Error("budget and category are required");
  const share = chipOf(chips, "share");
  const cap = chipOf(chips, "cap");
  const ask = chipOf(chips, "askAbove");
  const perPurchase = {
    ...(cap ? { hard_cap_minor: cap.amountMinor } : {}),
    ...(share ? { share_of_remaining_bp: share.bp } : {}),
    ...(ask ? { ask_above_minor: ask.amountMinor } : {}),
  };
  return {
    budget: { amount_minor: budget, currency: "HKD" },
    ...(Object.keys(perPurchase).length > 0 ? { per_purchase: perPurchase } : {}),
    categories: [firstSlug, ...restSlugs],
    merchants: { allow: null, deny: [] },
    seller_check: { require_capture: chipOf(chips, "sellers")?.verifiedOnly ?? true },
  };
}

/** 23:59:59 Hong Kong time on a Hong Kong day (YYYY-MM-DD), as epoch milliseconds. */
const endOfHkDayMs = (day: string): number => Date.parse(`${day}T00:00:00Z`) + DAY_MS - HKT_OFFSET_MS - 1000;
const cappedDate = (day: string, now: Date) => capEnd(endOfHkDayMs(day), now, MAX_PERIOD_DAYS);

/** Month end in Hong Kong as RFC 3339 UTC, N days after the seal moment, or the named date (cut to the longest a budget may run). */
export function validUntilFor(chips: readonly RuleChip[], now: Date): string {
  const end = chipOf(chips, "expiry");
  if (end?.mode === "days") return addMs(now.toISOString(), end.days * DAY_MS).replace(".000Z", "Z");
  if (end?.mode === "date") return toTimestamp(cappedDate(end.day, now).endMs);
  return monthEndHk(now);
}

/** The clamp for a named date that is further off than a budget may run, worded as the model compiler's. */
export function expiryClamps(chips: readonly RuleChip[], now: Date): readonly Clamp[] {
  const end = chipOf(chips, "expiry");
  return end?.mode === "date" && cappedDate(end.day, now).capped ? [periodClamp(end.asked, MAX_PERIOD_DAYS)] : [];
}

/** The Hong Kong day the sentence itself ends the budget on (a length or a date), or null when it names none. */
export function statedUntilDay(chips: readonly RuleChip[], now: Date): string | null {
  const first = chips.find((c) => c.kind === "expiry");
  if (!first?.valid || first.value.kind !== "expiry" || first.value.mode === "month_end") return null;
  return new Date(Date.parse(validUntilFor(chips, now)) + HKT_OFFSET_MS).toISOString().slice(0, 10);
}

export function sealRequestFrom(sentence: string, chips: readonly RuleChip[], now: Date): SealRequest {
  return { intentText: sentence, rules: chipsToRules(chips), validUntil: validUntilFor(chips, now) };
}

/** The booth preset sealed on load (docs/06: packet HK$800 [F20]). */
export function m0Request(now: Date): SealRequest {
  return sealRequestFrom(M0_SENTENCE, compileMandate(M0_SENTENCE, now).chips, now);
}
