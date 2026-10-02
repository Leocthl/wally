// A calendar date a budget ends on, in Hong Kong time. Pure, so the model compiler (rules.ts) and the Seal screen's
// fixed rules parser (apps/web/src/booth) read, resolve and cap a stated date the same way. The year is never read: a
// date means the next time it comes round, which keeps a typo such as 2025 from moving an end into the past.

export interface EndDate {
  /** 1 to 12. */
  readonly month: number;
  /** 1 to 31, or null for the last day of the month. */
  readonly day: number | null;
}

export interface ResolvedEnd {
  /** The last second of the day in Hong Kong (23:59:59), as epoch milliseconds. */
  readonly endMs: number;
  /** The Hong Kong calendar day, YYYY-MM-DD. */
  readonly hkDay: string;
}

export const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
/** Longest each month can be; February counts its leap day, which is a real date in some years. */
const MOST_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const DAY_MS = 86_400_000;
const HKT_OFFSET_MS = 8 * 3_600_000;
/** Far enough ahead to reach the next 29 February, even across a century year that is not a leap year. */
const LOOK_AHEAD_YEARS = 8;

const isWhole = (n: number, min: number, max: number): boolean => Number.isInteger(n) && n >= min && n <= max;

/** True when the month exists and the day, if there is one, can fall in it. */
export function isRealDate(end: EndDate): boolean {
  if (!isWhole(end.month, 1, 12)) return false;
  return end.day === null || isWhole(end.day, 1, MOST_DAYS[end.month - 1] ?? 0);
}

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const two = (n: number): string => String(n).padStart(2, "0");

/**
 * The next 23:59:59 Hong Kong time on this date that has not passed yet (this year, else the following ones), or null
 * when the date does not exist or the clock is not a date. With no day it is the last day of the month.
 */
export function resolveEndDate(end: EndDate, now: Date): ResolvedEnd | null {
  const nowMs = now.getTime();
  if (!isRealDate(end) || Number.isNaN(nowMs)) return null;
  const firstYear = new Date(nowMs + HKT_OFFSET_MS).getUTCFullYear();
  for (let year = firstYear; year <= firstYear + LOOK_AHEAD_YEARS; year += 1) {
    const day = end.day ?? daysIn(year, end.month);
    if (day > daysIn(year, end.month)) continue; // 29 February in a common year
    const endMs = Date.UTC(year, end.month - 1, day + 1) - HKT_OFFSET_MS - 1000;
    if (endMs > nowMs) return { endMs, hkDay: `${year}-${two(end.month)}-${two(day)}` };
  }
  return null;
}

/** The date as a shopper would say it: "31 Oct", or "end of November" when there is no day. */
export function describeEndDate(end: EndDate): string {
  if (!isRealDate(end)) return "";
  return end.day === null ? `end of ${LONG_MONTHS[end.month - 1] ?? ""}` : `${end.day} ${SHORT_MONTHS[end.month - 1] ?? ""}`;
}

/** An end later than `maxDays` from now is cut to exactly that, and says so. */
export function capEnd(endMs: number, now: Date, maxDays: number): { readonly endMs: number; readonly capped: boolean } {
  const cap = now.getTime() + maxDays * DAY_MS;
  return endMs > cap ? { endMs: cap, capped: true } : { endMs, capped: false };
}
