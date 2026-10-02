// Static SIMULATED sample data for the style guide compositions. Money in integer minor units (CLAUDE.md), formatted
// only at the edge. The person and the shop are fictional.
import { formatHkd } from "../../domain/money";
import type { Locale } from "../../ui/locale";

export const SAMPLE = {
  name: "Mei",
  budget: 80000,
  left: 54100,
  jacket: 25900,
  shoes: 55000,
  shipping: 3000,
  teeMax: 15000,
  last4: "4821",
  shop: "Harbour Denim",
  until: "2026-10-31T23:59:00+08:00",
  receipts: 14,
  brokenAt: 7,
  timings: { picked: "0.4 s", read: "0.6 s", rules: "12 ms" },
  hashes: ["9f2c41ab", "51d0e7c3", "c7a8203e"],
} as const;

export function money(minor: number): string {
  return formatHkd(minor);
}

export function shortDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "zh-HK" ? "zh-HK" : "en-HK", { day: "numeric", month: "short", timeZone: "Asia/Hong_Kong" }).format(new Date(iso));
}
