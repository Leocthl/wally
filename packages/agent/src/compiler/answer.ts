// Shape check of the compiler model's answer. The grammar already constrains it; this re-checks every field in
// code because the answer is untrusted, and anything off is a failure (the caller falls back to compile.ts).
import { isRealDate } from "./end-date";
import type { RawRules } from "./rules";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const PERIODS: readonly RawRules["period"][] = ["this_month", "days", "weeks", "not_stated"];
const SELLERS: readonly RawRules["sellers"][] = ["verified_only", "any", "not_stated"];
const PERS: readonly RawRules["per"][] = ["hour", "day", "week", "not_stated"];

/** A non-negative whole number or null; undefined (absent) reads as null; anything else is invalid. */
function wholeOrNull(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null) return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : "invalid";
}

/** A whole number from `min` to `max`, or null; undefined (absent) reads as null; anything else is invalid. */
function rangeOrNull(value: unknown, min: number, max: number): number | null | "invalid" {
  if (value === undefined || value === null) return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max ? value : "invalid";
}

/** A date that is not on the calendar, or a day with no month, says nothing: both go, the rest of the answer stays. */
function usableEnd(month: number | null, day: number | null): { readonly endMonth: number | null; readonly endDay: number | null } {
  return month !== null && isRealDate({ month, day }) ? { endMonth: month, endDay: day } : { endMonth: null, endDay: null };
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T | null): T | "invalid" {
  if (value === undefined && fallback !== null) return fallback;
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : "invalid";
}

export function parseCompilerAnswer(content: string): RawRules | null {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isRecord(json)) return null;
  const categories = json["categories"];
  if (!Array.isArray(categories) || !categories.every((c) => typeof c === "string")) return null;
  const numbers = {
    budgetHkd: wholeOrNull(json["budget_hkd"]),
    periodCount: wholeOrNull(json["period_count"]),
    capHkd: wholeOrNull(json["cap_hkd"]),
    askAboveHkd: wholeOrNull(json["ask_above_hkd"]),
    sharePercent: wholeOrNull(json["share_percent"]),
    maxPurchases: wholeOrNull(json["max_purchases"]),
  };
  const period = oneOf(json["period"], PERIODS, null);
  const sellers = oneOf(json["sellers"], SELLERS, null);
  const per = oneOf(json["per"], PERS, "not_stated");
  const endMonth = rangeOrNull(json["end_month"], 1, 12);
  const endDay = rangeOrNull(json["end_day"], 1, 31);
  if (Object.values(numbers).includes("invalid") || period === "invalid" || sellers === "invalid" || per === "invalid") return null;
  if (endMonth === "invalid" || endDay === "invalid") return null;
  const n = numbers as { [K in keyof typeof numbers]: number | null };
  return { ...n, categories: categories as string[], period, sellers, per, ...usableEnd(endMonth, endDay) };
}
