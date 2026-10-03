// Deterministic half of the compiler: the model's typed fields become CompiledRules and a valid-until date in
// code. Money becomes integer minor units, dates come from `now`, the budget is clamped to the rail ceiling
// [F1.ceiling], unknown categories are dropped, and nothing may loosen a default: sellers stay verified unless
// the shopper switches the chip off, and a velocity limit is kept only when it is at least as strict as F32.
import type { CompiledRules } from "@wally/core/generated";
import type { CompilerLimits } from "./config";
import { capEnd, describeEndDate, resolveEndDate } from "./end-date";

/** The answer as the model gave it, after a shape check; amounts in whole HK dollars. */
export interface RawRules {
  readonly budgetHkd: number | null;
  readonly categories: readonly string[];
  readonly period: "this_month" | "days" | "weeks" | "not_stated";
  readonly periodCount: number | null;
  readonly sellers: "verified_only" | "any" | "not_stated";
  readonly capHkd: number | null;
  readonly askAboveHkd: number | null;
  readonly sharePercent: number | null;
  readonly maxPurchases: number | null;
  readonly per: "hour" | "day" | "week" | "not_stated";
  /** The calendar date the budget ends on, when the sentence names one: month 1 to 12, day 1 to 31 or null for the month's end. */
  readonly endMonth: number | null;
  readonly endDay: number | null;
}

export interface Clamp {
  readonly field: string;
  /** What the sentence asked for, as the model read it. */
  readonly asked: string;
  /** What the suggestion carries instead. */
  readonly applied: string;
  readonly why: string;
}

export interface Note {
  readonly en: string;
  readonly zhHK: string;
}

export type BuiltRules =
  | { readonly ok: true; readonly rules: CompiledRules; readonly validUntil: string; readonly clamped: readonly Clamp[]; readonly notes: readonly Note[] }
  | { readonly ok: false; readonly reason: "no_budget" | "budget_below_minimum" | "no_category" };

const HOUR_S = 3_600;
const DAY_MS = 86_400_000;
const HKT_OFFSET_MS = 8 * 3_600_000;
const WINDOW_S: Readonly<Record<RawRules["per"], number | null>> = { hour: HOUR_S, day: 24 * HOUR_S, week: 7 * 24 * HOUR_S, not_stated: null };
const BP_PER_PERCENT = 100;
const MINOR_PER_HKD = 100;

/** RFC 3339 UTC with Z and whole seconds, the schema's Timestamp form. */
export function toTimestamp(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
}

/** Last second of the current month in Hong Kong time, as UTC: the booth's month-end default (compile.ts). */
export function monthEndHk(now: Date): string {
  const hk = new Date(now.getTime() + HKT_OFFSET_MS);
  return toTimestamp(Date.UTC(hk.getUTCFullYear(), hk.getUTCMonth() + 1, 1) - HKT_OFFSET_MS - 1000);
}

const hkd = (minor: number): string => (minor % MINOR_PER_HKD === 0 ? `HK$${minor / MINOR_PER_HKD}` : `HK$${(minor / MINOR_PER_HKD).toFixed(2)}`);

/** The clamp for a budget that would run past the longest period a sentence may set (also used by the fixed rules parser). */
export function periodClamp(asked: string, maxDays: number): Clamp {
  return { field: "valid_until", asked, applied: `${maxDays} days`, why: `a budget runs at most ${maxDays} days` };
}

interface Wish {
  readonly endMs: number;
  /** What the sentence asked for, in the shopper's terms, for the clamp. */
  readonly asked: string;
}

/** "7 days" or "2 weeks": the budget runs that long from the seal. */
function lasting(raw: RawRules, now: Date): Wish | null {
  const count = raw.periodCount;
  if ((raw.period !== "days" && raw.period !== "weeks") || count === null || count < 1) return null;
  const days = raw.period === "weeks" ? count * 7 : count;
  return { endMs: now.getTime() + days * DAY_MS, asked: `${days} days` };
}

/** "until 31 Oct": the next time that date comes round, 23:59:59 Hong Kong time. A date that does not exist says nothing. */
function dated(raw: RawRules, now: Date): Wish | null {
  if (raw.endMonth === null) return null;
  const end = { month: raw.endMonth, day: raw.endDay };
  const resolved = resolveEndDate(end, now);
  return resolved === null ? null : { endMs: resolved.endMs, asked: describeEndDate(end) };
}

const NO_END_DATE: Note = { en: "No end date in the sentence: the budget ends at the end of this month (HK time).", zhHK: "句子沒有寫結束日期：預算在本月底（香港時間）結束。" };

/**
 * When the budget ends. Of everything the sentence states (this month, a length, a date) the earliest end wins, so a
 * sentence never lengthens a budget, and the result is cut to the longest period a sentence may set. When it states
 * nothing the budget ends with this month, and a note says so.
 */
function period(raw: RawRules, now: Date, limits: CompilerLimits): { readonly validUntil: string; readonly clamp: Clamp | null; readonly note: Note | null } {
  const thisMonth: Wish | null = raw.period === "this_month" ? { endMs: Date.parse(monthEndHk(now)), asked: "this month" } : null;
  const stated = [thisMonth, lasting(raw, now), dated(raw, now)].filter((w): w is Wish => w !== null);
  const [first, ...later] = stated;
  if (first === undefined) return { validUntil: monthEndHk(now), clamp: null, note: NO_END_DATE };
  const earliest = later.reduce((a, b) => (b.endMs < a.endMs ? b : a), first);
  const kept = capEnd(earliest.endMs, now, limits.maxPeriodDays);
  return { validUntil: toTimestamp(kept.endMs), clamp: kept.capped ? periodClamp(earliest.asked, limits.maxPeriodDays) : null, note: null };
}

function perPurchase(raw: RawRules, budgetMinor: number): { readonly value: CompiledRules["per_purchase"] | undefined; readonly clamps: readonly Clamp[] } {
  const clamps: Clamp[] = [];
  const capAsked = raw.capHkd === null ? null : raw.capHkd * MINOR_PER_HKD;
  const cap = capAsked === null || capAsked < 1 ? null : Math.min(capAsked, budgetMinor);
  if (capAsked !== null && cap !== capAsked) clamps.push({ field: "per_purchase.hard_cap_minor", asked: hkd(capAsked), applied: cap === null ? "none" : hkd(cap), why: "a per-purchase cap must be above zero and at most the budget" });
  const askAsked = raw.askAboveHkd === null ? null : raw.askAboveHkd * MINOR_PER_HKD;
  const ask = askAsked !== null && askAsked >= 1 && askAsked <= budgetMinor ? askAsked : null;
  if (askAsked !== null && ask === null) clamps.push({ field: "per_purchase.ask_above_minor", asked: hkd(askAsked), applied: "none", why: "an ask-above amount must be above zero and at most the budget" });
  const share = raw.sharePercent !== null && raw.sharePercent >= 1 && raw.sharePercent <= 100 ? raw.sharePercent * BP_PER_PERCENT : null;
  if (raw.sharePercent !== null && share === null) clamps.push({ field: "per_purchase.share_of_remaining_bp", asked: `${raw.sharePercent}%`, applied: "none", why: "a share must be 1 to 100 percent" });
  const value = {
    ...(cap === null ? {} : { hard_cap_minor: cap }),
    ...(share === null ? {} : { share_of_remaining_bp: share }),
    ...(ask === null ? {} : { ask_above_minor: ask }),
  };
  return { value: Object.keys(value).length > 0 ? value : undefined, clamps };
}

function velocity(raw: RawRules, limits: CompilerLimits): { readonly value: CompiledRules["velocity"] | undefined; readonly clamp: Clamp | null } {
  const windowS = WINDOW_S[raw.per];
  if (raw.maxPurchases === null || windowS === null) return { value: undefined, clamp: null };
  const asked = `${raw.maxPurchases} per ${raw.per}`;
  const stricter = raw.maxPurchases >= 1 && raw.maxPurchases <= limits.velocity.max_mints && windowS >= limits.velocity.window_s;
  if (stricter) return { value: { max_mints: raw.maxPurchases, window_s: windowS }, clamp: null };
  const why = `looser than the default of ${limits.velocity.max_mints} per ${limits.velocity.window_s / 60} minutes [F32]; a suggestion never loosens a default`;
  return { value: undefined, clamp: { field: "velocity", asked, applied: "the default", why } };
}

/** Builds the rules. Fails (so the caller falls back to the rule-based compile) when budget or category is missing. */
export function buildRules(raw: RawRules, allowedCategories: readonly string[], now: Date, limits: CompilerLimits): BuiltRules {
  if (raw.budgetHkd === null) return { ok: false, reason: "no_budget" };
  const askedMinor = raw.budgetHkd * MINOR_PER_HKD;
  if (askedMinor < limits.minBudgetMinor) return { ok: false, reason: "budget_below_minimum" };
  const budgetMinor = Math.min(askedMinor, limits.ceilingMinor);
  const categories = [...new Set(raw.categories.filter((c) => allowedCategories.includes(c)))];
  const [firstCategory, ...otherCategories] = categories;
  if (firstCategory === undefined) return { ok: false, reason: "no_category" };

  const clamped: Clamp[] = [];
  const notes: Note[] = [];
  if (budgetMinor < askedMinor) clamped.push({ field: "budget.amount_minor", asked: hkd(askedMinor), applied: hkd(budgetMinor), why: "one card's limit ceiling [F1]" });
  const dropped = raw.categories.filter((c) => !allowedCategories.includes(c));
  if (dropped.length > 0) clamped.push({ field: "categories", asked: dropped.join(", "), applied: "dropped", why: "not a known category" });
  if (raw.sellers === "any") {
    clamped.push({ field: "seller_check.require_capture", asked: "any seller", applied: "verified sellers only", why: "a suggestion never loosens a default; switch the sellers chip off yourself if you mean it" });
  } else if (raw.sellers === "not_stated") {
    notes.push({ en: "Sellers not mentioned: verified sellers only (the safe default).", zhHK: "句子沒有提到賣家：只限已驗證賣家（安全預設）。" });
  }
  const end = period(raw, now, limits);
  if (end.clamp !== null) clamped.push(end.clamp);
  if (end.note !== null) notes.push(end.note);
  const purchase = perPurchase(raw, budgetMinor);
  clamped.push(...purchase.clamps);
  const speed = velocity(raw, limits);
  if (speed.clamp !== null) clamped.push(speed.clamp);

  const rules: CompiledRules = {
    budget: { amount_minor: budgetMinor, currency: "HKD" },
    ...(purchase.value === undefined ? {} : { per_purchase: purchase.value }),
    categories: [firstCategory, ...otherCategories],
    merchants: { allow: null, deny: [] },
    seller_check: { require_capture: true },
    ...(speed.value === undefined ? {} : { velocity: speed.value }),
  };
  return { ok: true, rules, validUntil: end.validUntil, clamped, notes };
}
