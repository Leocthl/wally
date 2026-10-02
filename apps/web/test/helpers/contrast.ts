// WCAG 2.x contrast helpers for the token test (docs/04 Accessibility: "Lane C adds a token test with the same floors").
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Mode = "light" | "dark";

// Plain path maths: under jsdom the global URL is not Node's URL, so avoid `new URL(..., import.meta.url)`.
export const TOKENS_CSS = resolve(dirname(fileURLToPath(import.meta.url)), "../../src/design/tokens.css");
const PAIR = /--([a-z0-9-]+):\s*light-dark\(\s*(#[0-9A-Fa-f]{6})\s*,\s*(#[0-9A-Fa-f]{6})\s*\)/g;

/** Parses every `--name: light-dark(#light, #dark)` declaration in tokens.css. */
export function readColourTokens(css: string = readFileSync(TOKENS_CSS, "utf8")): ReadonlyMap<string, Record<Mode, string>> {
  const map = new Map<string, Record<Mode, string>>();
  for (const m of css.matchAll(PAIR)) {
    const [, name, light, dark] = m;
    if (name && light && dark) map.set(name, { light, dark });
  }
  return map;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
