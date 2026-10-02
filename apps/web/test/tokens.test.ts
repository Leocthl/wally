// Token test (docs/04 Accessibility): same floors as the checked script. Text 4.5:1, UI 3:1, state 5.5:1.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOLD_MS } from "../src/design/motion";
import { contrast, readColourTokens, TOKENS_CSS, type Mode } from "./helpers/contrast";

const tokens = readColourTokens();
const css = readFileSync(TOKENS_CSS, "utf8");
const MODES: readonly Mode[] = ["light", "dark"];
const SURFACES = ["paper", "paper-raised", "ledger-bg", "ledger-surface"] as const;

function ratio(fg: string, bg: string, mode: Mode): number {
  const f = tokens.get(fg)?.[mode];
  const b = tokens.get(bg)?.[mode];
  if (!f || !b) throw new Error(`token missing: ${fg} or ${bg}`);
  return contrast(f, b);
}

const TEXT_FLOOR = 4.5;
const UI_FLOOR = 3;
const STATE_FLOOR = 5.5;

const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["ink", "paper"], ["ink", "paper-raised"], ["ink-soft", "paper"], ["ink-soft", "paper-raised"],
  ["vermilion", "paper"], ["vermilion", "paper-raised"], ["on-vermilion", "vermilion"],
  ["brass-text", "paper"], ["brass-text", "paper-raised"],
  ["ledger-ink", "ledger-bg"], ["ledger-ink", "ledger-surface"],
  ["ledger-ink-soft", "ledger-bg"], ["ledger-ink-soft", "ledger-surface"],
  ["on-stop", "stopped"],
  ["obs", "obs-bg"], ["meas", "meas-bg"], ["asm", "asm-bg"], ["sim", "sim-bg"],
];
const UI_PAIRS: readonly (readonly [string, string])[] = [
  ["brass-line", "paper"], ["brass-line", "paper-raised"],
  ["line-strong", "ledger-bg"], ["line-strong", "ledger-surface"],
  ["vermilion", "meter-track"],
  ["chart-b0", "ledger-surface"], ["chart-b1", "ledger-surface"], ["chart-b2", "ledger-surface"],
  ...SURFACES.map((s) => ["focus", s] as const),
];

describe("design tokens (docs/04)", () => {
  it.each(MODES)("text pairs hold the 4.5:1 floor in %s mode", (mode) => {
    for (const [fg, bg] of TEXT_PAIRS) expect(ratio(fg, bg, mode), `${fg} on ${bg} (${mode})`).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });

  it.each(MODES)("UI pairs hold the 3:1 floor in %s mode", (mode) => {
    for (const [fg, bg] of UI_PAIRS) expect(ratio(fg, bg, mode), `${fg} on ${bg} (${mode})`).toBeGreaterThanOrEqual(UI_FLOOR);
  });

  it.each(MODES)("state colours hold 5.5:1 on their tint and on all four surfaces in %s mode", (mode) => {
    for (const state of ["minted", "stopped", "escalated", "pending"]) {
      expect(ratio(state, `${state}-bg`, mode), `${state} on tint`).toBeGreaterThanOrEqual(STATE_FLOOR);
      for (const surface of SURFACES) expect(ratio(state, surface, mode), `${state} on ${surface}`).toBeGreaterThanOrEqual(STATE_FLOOR);
    }
  });

  it("declares both registers and the dark and light overrides", () => {
    expect(css).toContain('[data-register="packet"]');
    expect(css).toContain('[data-register="ledger"]');
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain(':root[data-theme="light"]');
  });

  it("zeroes the decorative durations under reduced motion and keeps the hold duration", () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([^}]*\{[^}]*\})\s*\}/.exec(css)?.[1] ?? "";
    for (const d of ["--dur-seal", "--dur-mint", "--dur-stop", "--dur-expire"]) expect(reduced).toContain(`${d}: 0ms`);
    expect(reduced).not.toContain("--dur-hold");
  });

  it("keeps the JS hold duration in sync with --dur-hold", () => {
    expect(css).toContain(`--dur-hold: ${HOLD_MS}ms`);
  });

  it("has a plain-colour fallback for every light-dark() token, in sync with tokens.css", () => {
    const fallback = readFileSync(TOKENS_CSS.replace("tokens.css", "tokens-fallback.css"), "utf8");
    expect(fallback).toContain("@supports not (color: light-dark(");
    const [lightPart, darkPart] = fallback.split("@media (prefers-color-scheme: dark)");
    for (const [name, pair] of tokens) {
      expect(lightPart, `light ${name}`).toContain(`--${name}: ${pair.light};`);
      expect(darkPart, `dark ${name}`).toContain(`--${name}: ${pair.dark};`);
    }
  });

  it("keeps the 44px touch target token", () => {
    expect(css).toContain("--tap: 2.75rem");
  });
});
