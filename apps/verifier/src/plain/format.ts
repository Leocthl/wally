// Plain mode shows a time as Hong Kong time ("3 Oct 2026, 10:05") and a money field as HK$ ("25900" is HK$259). Both are
// read from UNVERIFIED log text, so anything that does not parse gives null: never guessed, never quoted, never thrown on.
// The time is parsed here (strict ISO 8601 with a zone), the zone shift is done by Intl, and the month names are a fixed
// table, so the words do not change with the browser's locale data.
import type { Bi } from "../strings";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const ISO =
  /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,9}))?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

const MIN_YEAR = 1970; // Date.UTC reads years 0 to 99 as 19xx; a log from before 1970 is not a log

/** The formatter is built once; a runtime without the zone gives null and every time is then shown as it was written. */
const HONG_KONG: Intl.DateTimeFormat | null = (() => {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
  } catch {
    return null;
  }
})();

/** Milliseconds since the epoch for a strictly formed ISO 8601 time that names its zone; null for anything else. */
export function parseIso(text: string): number | null {
  const match = ISO.exec(text);
  if (match === null) return null;
  const [, year, month, day, hour, minute, second, fraction, zone] = match;
  const [y, mo, d] = [Number(year), Number(month), Number(day)];
  if (y < MIN_YEAR || zone === undefined) return null;
  // Date.UTC rolls 30 February over into March; a day the month does not have is not a time.
  if (new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) return null;
  const ms = fraction === undefined ? 0 : Number(fraction.padEnd(3, "0").slice(0, 3));
  const utc = Date.UTC(y, mo - 1, d, Number(hour), Number(minute), Number(second ?? 0), ms);
  if (zone === "Z") return utc;
  const sign = zone.startsWith("-") ? -1 : 1;
  const offsetMinutes = Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6));
  return utc - sign * offsetMinutes * 60_000;
}

interface HongKongClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

function hongKongClock(ms: number): HongKongClock | null {
  if (HONG_KONG === null) return null;
  try {
    const parts = HONG_KONG.formatToParts(new Date(ms));
    const pick = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((part) => part.type === type)?.value);
    const clock = { year: pick("year"), month: pick("month"), day: pick("day"), hour: pick("hour"), minute: pick("minute") };
    return Object.values(clock).every(Number.isInteger) ? clock : null;
  } catch {
    return null;
  }
}

const two = (n: number): string => String(n).padStart(2, "0");

/**
 * "3 Oct 2026, 10:05" and "2026年10月3日 10:05" for a time in the log. Text that is not a time gives null, never the text:
 * the plain view says "Time not readable" instead of quoting a line of the log back at a reader.
 */
export function hkTime(text: string): Bi | null {
  const ms = parseIso(text);
  const clock = ms === null ? null : hongKongClock(ms);
  if (clock === null) return null;
  const at = `${two(clock.hour)}:${two(clock.minute)}`;
  const month = MONTHS[clock.month - 1] ?? String(clock.month);
  return {
    en: `${clock.day} ${month} ${clock.year}, ${at}`,
    zh: `${clock.year}年${clock.month}月${clock.day}日 ${at}`, // NEEDS-REVIEW zh-HK
  };
}

/** Whole digits of an amount in minor units (cents) as HK$: "25900" is "HK$259", "25950" is "HK$259.50"; null if not digits. */
export function hkdFromMinor(digits: string): string | null {
  if (!/^\d{1,18}$/.test(digits)) return null;
  const padded = digits.padStart(3, "0");
  const dollars = padded.slice(0, -2).replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = padded.slice(-2);
  return cents === "00" ? `HK$${dollars}` : `HK$${dollars}.${cents}`;
}
