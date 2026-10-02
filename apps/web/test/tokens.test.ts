// Token test (docs/04 Accessibility), phase A of the Wally restyle. The full AA pair table moved to design-tokens.test.ts;
// this file keeps the older, stricter floors that the screens rely on: state text 5.5:1, plus the motion and target checks.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOLD_MS } from "../src/design/motion";
import { contrast, readColourTokens, TOKENS_CSS, type Mode } from "./helpers/contrast";

const tokens = readColourTokens();
const css = readFileSync(TOKENS_CSS, "utf8");
const MODES: readonly Mode[] = ["light", "dark"];
const SURFACES = ["c-bg", "c-surface", "c-surface-raised"] as const;

function ratio(fg: string, bg: string, mode: Mode): number {
  const f = tokens.get(fg)?.[mode];
  const b = tokens.get(bg)?.[mode];
  if (!f || !b) throw new Error(`token missing: ${fg} or ${bg}`);
  return contrast(f, b);
}

const STATE_FLOOR = 5.5;

describe("design tokens (docs/04)", () => {
  it.each(MODES)("state text (ok, warn, stop) holds 5.5:1 on its tint and on every surface in %s mode", (mode) => {
    for (const state of ["ok", "warn", "stop"]) {
      expect(ratio(`c-${state}-ink`, `c-${state}-tint`, mode), `${state} on tint`).toBeGreaterThanOrEqual(STATE_FLOOR);
      for (const surface of SURFACES) expect(ratio(`c-${state}-ink`, surface, mode), `${state} on ${surface}`).toBeGreaterThanOrEqual(STATE_FLOOR);
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

  it("has a plain-colour fallback for every light-dark() hex token, in sync with tokens.css", () => {
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
