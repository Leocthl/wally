// Display formatting for the shell screens. Hong Kong time for every date (the booth and its visitors are in HK).
import type { Locale } from "../ui/locale";

const HK_ZONE = "Asia/Hong_Kong";
const SECOND_MS = 1000;
const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;

function intlLocale(locale: Locale): string {
  return locale === "zh-HK" ? "zh-HK" : "en-HK";
}

/** "31 Oct" / "10月31日". */
export function formatDay(iso: string, locale: Locale): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", timeZone: HK_ZONE }).format(new Date(ms));
}

/** "Sat 31 Oct 2026" / "2026年10月31日 星期六", for the seal summary. */
export function formatLongDay(iso: string, locale: Locale): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: HK_ZONE }).format(new Date(ms));
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Time left as m:ss, or h:mm:ss from an hour up. Never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / SECOND_MS));
  const h = Math.floor(total / HOUR_S);
  const m = Math.floor((total % HOUR_S) / MINUTE_S);
  const s = total % MINUTE_S;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
