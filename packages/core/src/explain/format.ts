// Pure formatters for explanation templates. Never throw: a bad input renders as "?".
// Money is integer HKD minor units (mandate.schema.json MoneyMinor); no floats touch money.

export type Locale = "en" | "zh-HK";

/** Minor units per HK dollar (currency definition, not a threshold). */
const CENTS_PER_DOLLAR = 100;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3_600;
/** Hong Kong Time is UTC+8 with no daylight saving; the register states packet expiry in HK time [F59]. */
const HKT_OFFSET_MS = 8 * SECONDS_PER_HOUR * 1_000;

const UNKNOWN = "?";

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 55000 -> "HK$550"; 123456789 -> "HK$1,234,567.89". */
export function formatHkd(minor: unknown): string {
  if (typeof minor !== "number" || !Number.isSafeInteger(minor) || minor < 0) return `HK$${UNKNOWN}`;
  const dollars = Math.floor(minor / CENTS_PER_DOLLAR);
  const cents = minor % CENTS_PER_DOLLAR;
  const whole = groupThousands(String(dollars));
  return cents === 0 ? `HK$${whole}` : `HK$${whole}.${String(cents).padStart(2, "0")}`;
}

/** Probability in [0, 1] with two decimals, e.g. 0.6808 -> "0.68". */
export function formatProbability(p: unknown): string {
  return typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1 ? p.toFixed(2) : UNKNOWN;
}

/** Non-negative integer count as text. */
export function formatCount(n: unknown): string {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? String(n) : UNKNOWN;
}

/** Whole seconds as "24 h", "10 min" or "45 s" (zh-HK: 小時, 分鐘, 秒). */
export function formatDuration(seconds: unknown, locale: Locale): string {
  if (typeof seconds !== "number" || !Number.isSafeInteger(seconds) || seconds <= 0) return UNKNOWN;
  const zh = locale === "zh-HK";
  if (seconds % SECONDS_PER_HOUR === 0) return `${seconds / SECONDS_PER_HOUR} ${zh ? "小時" : "h"}`; // NEEDS-REVIEW zh-HK
  if (seconds % SECONDS_PER_MINUTE === 0) return `${seconds / SECONDS_PER_MINUTE} ${zh ? "分鐘" : "min"}`; // NEEDS-REVIEW zh-HK
  return `${seconds} ${zh ? "秒" : "s"}`; // NEEDS-REVIEW zh-HK
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** RFC 3339 timestamp -> "2026-10-03 10:12 HKT". */
export function formatHkt(timestamp: unknown): string {
  if (typeof timestamp !== "string") return UNKNOWN;
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) return UNKNOWN;
  const t = new Date(ms + HKT_OFFSET_MS);
  const date = `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
  return `${date} ${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())} HKT`;
}

/** A recorded string (domain, category, status), or "?". */
export function formatText(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : UNKNOWN;
}

/** A recorded list of strings joined with ", ", or "?". */
export function formatList(value: unknown): string {
  if (!Array.isArray(value)) return UNKNOWN;
  const items = value.filter((v): v is string => typeof v === "string" && v.length > 0);
  return items.length > 0 ? items.join(", ") : UNKNOWN;
}
