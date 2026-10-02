// Reduced motion (docs/04 Accessibility, Motion): durations are zero, nothing loops, and the hook follows the preference.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useReducedMotion } from "../src/hooks/useReducedMotion";
import { setReducedMotion } from "./setup";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const DESIGN = join(SRC, "design");
const sheets = readdirSync(DESIGN).filter((f) => f.endsWith(".css")).map((f) => [f, readFileSync(join(DESIGN, f), "utf8")] as const);

/** Every stylesheet of the app (design, primitives, shell, screens, Wally): the motion lives in the screens' sheets now. */
function allSheets(dir: string): readonly (readonly [string, string])[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? allSheets(join(dir, e.name)) : e.name.endsWith(".css") ? [[e.name, readFileSync(join(dir, e.name), "utf8")] as const] : [],
  );
}

describe("useReducedMotion", () => {
  it("follows prefers-reduced-motion", () => {
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
    setReducedMotion(true);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
  });
});

describe("motion in the stylesheets", () => {
  const motion = allSheets(SRC)
    .flatMap(([file, css]) => css.split("\n").filter((l) => /^\s*(?:[^/*]*\s)?(animation|transition)(-duration)?\s*:/.test(l)).map((l) => [file, l.trim()] as const))
    .filter(([, line]) => !/(animation|transition)\s*:\s*none\b/.test(line));

  it("finds the motion declarations it is meant to guard", () => {
    expect(motion.length).toBeGreaterThan(4);
  });

  it("takes every duration from a --dur token, so tokens.css can zero it (no literal times)", () => {
    for (const [file, line] of motion) {
      expect(line, `${file}: ${line}`).not.toMatch(/(^|[\s:,])\d*\.?\d+m?s\b/);
      expect(line, `${file}: ${line}`).toMatch(/var\(--dur-/);
    }
  });

  it("never loops: one motion per event, no infinite animation", () => {
    for (const [file, css] of sheets) expect(css, file).not.toMatch(/infinite/);
  });

  it("keeps --dur-hold out of the reduced-motion override (the hold is functional)", () => {
    const tokens = sheets.find(([f]) => f === "tokens.css")?.[1] ?? "";
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/.exec(tokens)?.[0] ?? "";
    expect(block).toContain("--dur-mint: 0ms");
    expect(block).not.toContain("--dur-hold");
  });
});
