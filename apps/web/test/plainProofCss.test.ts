// The stylesheet of plain Proof and the plain parts of Receipts (proofPlain.css): colour pairs that read in light and dark,
// rows a thumb can hit, a focus ring that stays inside a clipped list, long logs that skip drawing what is off screen, and
// nothing that moves on the first paint of a list. (design-css.test.ts guards the rest: tokens only, no glass, z-index scale.)
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrast, readColourTokens, type Mode } from "./helpers/contrast";

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(HERE, "../src/screens/proof/proofPlain.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = readColourTokens();
const MODES: readonly Mode[] = ["light", "dark"];

/** Every innermost rule block, media queries flattened: [selector, declarations]. */
function blocks(source: string): readonly (readonly [string, Readonly<Record<string, string>>])[] {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => {
    const decls: Record<string, string> = {};
    for (const part of (body ?? "").split(";")) {
      const at = part.indexOf(":");
      if (at > 0) decls[part.slice(0, at).trim()] = part.slice(at + 1).trim();
    }
    return [(selector ?? "").trim(), decls] as const;
  });
}

const tokenOf = (value: string | undefined): string | null => /^var\(--([a-z0-9-]+)\)$/.exec(value ?? "")?.[1] ?? null;
function ratio(fg: string, bg: string, mode: Mode): number {
  const f = tokens.get(fg)?.[mode];
  const b = tokens.get(bg)?.[mode];
  if (!f || !b) throw new Error(`token missing: ${fg} or ${bg}`);
  return contrast(f, b);
}

const rule = (selector: string): Readonly<Record<string, string>> => {
  const found = blocks(css).find(([s]) => s === selector);
  if (!found) throw new Error(`no rule for ${selector}`);
  return found[1];
};

describe("plain stylesheet: colours", () => {
  it("every rule that sets both a text colour and a background token reads at 4.5:1 in light and dark", () => {
    const pairs = blocks(css).flatMap(([selector, d]) => {
      const fg = tokenOf(d["color"]);
      const bg = tokenOf(d["background"] ?? d["background-color"]);
      return fg && bg && tokens.has(fg) && tokens.has(bg) ? [{ selector, fg, bg }] : [];
    });
    expect(pairs.length).toBeGreaterThan(3);
    for (const { selector, fg, bg } of pairs) for (const mode of MODES) expect(ratio(fg, bg, mode), `${selector}: ${fg} on ${bg} (${mode})`).toBeGreaterThanOrEqual(4.5);
  });

  it("the words set on a background their parent supplies read at 4.5:1, and the lines and rings at 3:1", () => {
    const text: readonly (readonly [string, string, string])[] = [
      ["a row's second line on the list", "c-ink-muted", "c-surface"],
      ["a row's second line on the changed row", "c-ink-muted", "c-stop-tint"],
      ["Untouched on the list", "c-ok-ink", "c-surface"],
      ["Changed on the changed row, the banner title, the sheet note", "c-stop-ink", "c-stop-tint"],
      ["the banner's change line and the fail card's sentences", "c-ink", "c-stop-tint"],
      ["the untouched title", "c-ok-ink", "c-ok-tint"],
      ["the where-the-check-ran line", "c-ink-muted", "c-ok-tint"],
      ["the facts of a receipt", "c-ink-muted", "c-surface"],
      ["the facts on the changed row", "c-ink-muted", "c-stop-tint"],
      ["the neutral disc", "c-ink-muted", "c-surface-sunken"],
      ["a tick on its disc", "c-on-ok", "c-ok"],
      ["a cross on its disc", "c-on-stop", "c-stop"],
      ["the banner's alert icon", "c-on-stop", "c-stop"],
    ];
    for (const [what, fg, bg] of text) for (const mode of MODES) expect(ratio(fg, bg, mode), `${what} (${mode})`).toBeGreaterThanOrEqual(4.5);
    const lines: readonly (readonly [string, string, string])[] = [
      ["the dashed ring on the list", "c-line-strong", "c-surface"],
      ["the chain line on the list", "c-line-strong", "c-surface"],
      ["the chain line on the changed row", "c-stop", "c-stop-tint"],
      ["the untouched chain line", "c-ok", "c-surface"],
    ];
    for (const [what, fg, bg] of lines) for (const mode of MODES) expect(ratio(fg, bg, mode), `${what} (${mode})`).toBeGreaterThanOrEqual(3);
  });
});

describe("plain stylesheet: touch, focus and a long log", () => {
  it("makes every row at least 44 px tall", () => {
    const min = rule(".pf-tl__summary")["min-height"] ?? "";
    expect(min).toMatch(/^\d+(\.\d+)?rem$/);
    expect(Number.parseFloat(min)).toBeGreaterThanOrEqual(2.75);
  });

  it("keeps the focus ring inside the clipped list instead of removing it", () => {
    expect(rule(".pf-tl__summary:focus-visible")["outline-offset"]).toBe("-3px");
    expect(css).not.toMatch(/outline:\s*(none|0)/);
  });

  it("skips layout and paint for rows off screen, like the Receipts list", () => {
    expect(rule(".pf-tl__item")["content-visibility"]).toBe("auto");
    expect(rule(".pf-tl__item")["contain-intrinsic-size"]).toMatch(/^auto \d/);
  });

  it("hides the browser's own disclosure marker and draws one arrow", () => {
    expect(rule(".pf-tl__summary")["list-style"]).toBe("none");
    expect(css).toContain(".pf-tl__summary::-webkit-details-marker");
  });

  it("animates nothing on the first paint of a list: no keyframes, and the arrow turns only when motion is allowed", () => {
    expect(css).not.toMatch(/@keyframes|animation\s*:/);
    const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{[\s\S]*?\}\s*\}/g, "");
    expect(outside).not.toMatch(/transition\s*:/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.pf-tl__summary::after\s*\{\s*transition: transform var\(--dur-fast\)/);
  });

  it("lays the narrow banner out in a column of words and one full-width button", () => {
    expect(rule(".pf-banner")["display"]).toBe("grid");
    expect(rule(".pf-banner__row")["display"]).toBe("flex");
    expect(rule(".pf-banner__text")["min-width"]).toBe("0");
  });
});
