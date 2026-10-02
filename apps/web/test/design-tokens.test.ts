// Design tokens (Wally, phase A): WCAG AA for every allowed colour pair in light and dark, the generated fallback is in
// sync, legacy names still resolve, and the non-colour scales exist.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, isHex6, wcagLevel } from "../src/design/contrast";
import { CONTRAST_PAIRS } from "../src/design/contrastPairs";
import { buildFallbackCss, overlayTokens, parseThemedTokens, type Mode, type ThemedToken } from "../src/design/tokenTools";

const DESIGN = resolve(dirname(fileURLToPath(import.meta.url)), "../src/design");
const css = readFileSync(resolve(DESIGN, "tokens.css"), "utf8");
const warmCss = readFileSync(resolve(DESIGN, "tokens-warm.css"), "utf8");
const tokens = new Map(parseThemedTokens(css).map((t) => [t.name, t]));
const warm = overlayTokens(parseThemedTokens(css), parseThemedTokens(warmCss));
const MODES: readonly Mode[] = ["light", "dark"];

function valueIn(map: ReadonlyMap<string, ThemedToken>, name: string, mode: Mode): string {
  const t = map.get(name);
  if (!t) throw new Error(`token missing: --${name}`);
  return t[mode];
}

function value(name: string, mode: Mode): string {
  return valueIn(tokens, name, mode);
}

function failuresIn(map: ReadonlyMap<string, ThemedToken>, mode: Mode): string[] {
  return CONTRAST_PAIRS.map((p) => ({ ...p, ratio: contrastRatio(valueIn(map, p.fg, mode), valueIn(map, p.bg, mode)) }))
    .filter((p) => p.ratio < p.min)
    .map((p) => `${p.fg} on ${p.bg}: ${p.ratio.toFixed(2)} < ${p.min}`);
}

describe("contrast helpers", () => {
  it("computes the WCAG ratio (black on white is 21, a colour on itself is 1)", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#1A5CFF", "#1A5CFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#FFFFFF", "#1A5CFF")).toBeCloseTo(contrastRatio("#1A5CFF", "#FFFFFF"), 10);
  });

  it("grades ratios and rejects anything that is not #RRGGBB", () => {
    expect([wcagLevel(7.2), wcagLevel(4.6), wcagLevel(3.1), wcagLevel(2.9)]).toEqual(["AAA", "AA", "AA large", "fail"]);
    expect(isHex6("#0E1A33")).toBe(true);
    expect(() => contrastRatio("rgb(0 0 0)", "#FFFFFF")).toThrow(RangeError);
  });
});

describe("tokens.css (cool wallet palette)", () => {
  it("parses light-dark() pairs, including rgb() values with commas inside", () => {
    const parsed = parseThemedTokens("--a: light-dark(#111111, #222222); --b: light-dark(rgb(1 2 3 / 0.5), rgb(4, 5, 6));");
    expect(parsed).toEqual([
      { name: "a", light: "#111111", dark: "#222222" },
      { name: "b", light: "rgb(1 2 3 / 0.5)", dark: "rgb(4, 5, 6)" },
    ]);
  });

  it.each(MODES)("every allowed pair meets its WCAG AA floor in %s mode", (mode) => {
    expect(failuresIn(tokens, mode)).toEqual([]);
  });

  it.each(MODES)("the optional warm palette meets the same floors in %s mode", (mode) => {
    expect(parseThemedTokens(warmCss).length).toBeGreaterThan(10);
    expect(failuresIn(warm, mode)).toEqual([]);
  });

  it("checks more than sixty pairs, and every pair uses solid #RRGGBB colours", () => {
    expect(CONTRAST_PAIRS.length).toBeGreaterThan(60);
    for (const p of CONTRAST_PAIRS) for (const m of MODES) expect(isHex6(value(p.fg, m)) && isHex6(value(p.bg, m)), `${p.fg}/${p.bg}`).toBe(true);
  });

  it("keeps red and orange hues for stop and error tokens only (default cool palette)", () => {
    const hue = (hex: string): number => {
      const n = Number.parseInt(hex.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255) as [number, number, number];
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      if (d < 0.25) return -1; // greys and pale tints carry no hue signal
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const reddish = [...tokens.values()].filter((t) => MODES.some((m) => isHex6(t[m]) && hue(t[m]) >= 0 && (hue(t[m]) < 30 || hue(t[m]) > 340)));
    expect(reddish.map((t) => t.name).sort()).toEqual(["c-stop", "c-stop-ink"].sort());
  });

  it("declares the theme overrides, the scoped theme classes and both legacy registers", () => {
    for (const s of [':root[data-theme="dark"]', ':root[data-theme="light"]', ".theme-dark", ".theme-light", '[data-register="packet"]', '[data-register="ledger"]']) expect(css).toContain(s);
  });

  it("keeps every legacy name the phase-A screens use, pointing at a defined token", () => {
    const legacy = ["paper", "paper-raised", "ink", "ink-soft", "vermilion", "on-vermilion", "brass-line", "meter-track", "ledger-surface", "line-strong", "hairline", "focus", "minted", "minted-bg", "stopped", "stopped-bg", "on-stop", "escalated", "escalated-bg", "pending", "pending-bg", "r-packet", "r-ledger", "r-chip", "shadow-packet"];
    for (const name of legacy) {
      const m = new RegExp(`--${name}:\\s*var\\(--([a-z0-9-]+)\\)`).exec(css);
      expect(m, `--${name}`).not.toBeNull();
      expect(css, `--${name} target`).toMatch(new RegExp(`--${m?.[1] ?? "missing"}:`));
    }
  });

  it("has type, radius, spacing, safe-area, layer and motion scales in rem or tokens", () => {
    for (const t of ["--text-xs: 0.75rem", "--text-md: 1rem", "--text-5xl: 3.75rem", "--r-xl: 28px", "--r-pill: 999px", "--tap: 2.75rem", "--tap-lg: 3rem", "--safe-bottom: env(safe-area-inset-bottom, 0px)", "--z-toast: 60", "--ease-spring:", "--font-display: ui-rounded"]) expect(css).toContain(t);
    expect(css).toMatch(/--font-zh: -apple-system,[^;]*Roboto, "PingFang HK", "Noto Sans HK",\s*"Microsoft JhengHei"/);
  });

  it("zeroes every decorative duration under reduced motion and keeps the functional hold", () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([^}]*\{[^}]*\})\s*\}/.exec(css)?.[1] ?? "";
    const declared = [...css.matchAll(/(--dur-[a-z]+):\s*\d+ms/g)].map((m) => m[1] ?? "");
    for (const d of new Set(declared)) {
      if (d === "--dur-hold") expect(reduced).not.toContain(d);
      else expect(reduced, d).toContain(`${d}: 0ms`);
    }
  });
});

describe("tokens-fallback.css", () => {
  it("is exactly the generated sheet (run scripts/gen-token-fallback.ts after editing tokens.css)", () => {
    expect(readFileSync(resolve(DESIGN, "tokens-fallback.css"), "utf8")).toBe(buildFallbackCss(css, warmCss));
  });
});
