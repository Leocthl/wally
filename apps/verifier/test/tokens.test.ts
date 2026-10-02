// The design tokens (src/styles/tokens.css): the plain-value fallback block matches every light-dark() pair, and the
// colour pairs the page really uses pass WCAG AA in both modes (text 4.5:1, UI parts 3:1). The CSS is read as text, so a
// token edited on one side only fails here instead of on a phone.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(import.meta.dirname, "..", "src", "styles", "tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The text between the brace that opens at `open` and its partner. */
function balanced(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}") depth -= 1;
    if (depth === 0) return text.slice(open + 1, i);
  }
  throw new Error("unbalanced braces in tokens.css");
}

/** The body of the first block whose selector text starts at `selector`. */
function blockAfter(text: string, selector: string): string {
  const at = text.indexOf(selector);
  if (at < 0) throw new Error(`tokens.css has no ${selector}`);
  return balanced(text, text.indexOf("{", at));
}

/** Split "a, b" at the comma that is not inside parentheses. */
function splitPair(args: string): readonly [string, string] {
  let depth = 0;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "(") depth += 1;
    if (args[i] === ")") depth -= 1;
    if (args[i] === "," && depth === 0) return [args.slice(0, i).trim(), args.slice(i + 1).trim()];
  }
  throw new Error(`light-dark(${args}) has no second value`);
}

const norm = (value: string): string => value.replace(/\s+/g, " ").trim().toLowerCase();

function declarations(body: string): ReadonlyMap<string, string> {
  return new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1] ?? "", norm(m[2] ?? "")] as const));
}

const PAIRS = new Map(
  [...CSS.matchAll(/(--[\w-]+)\s*:\s*light-dark\(([^;]*)\)\s*;/g)].map((m) => {
    const [light, dark] = splitPair(m[2] ?? "");
    return [m[1] ?? "", { light: norm(light), dark: norm(dark) }] as const;
  }),
);

const SUPPORTS = blockAfter(CSS, "@supports not (color: light-dark(");
const FALLBACK_LIGHT = declarations(blockAfter(SUPPORTS, ":root {"));
const FALLBACK_DARK_MEDIA = declarations(blockAfter(blockAfter(SUPPORTS, "@media (prefers-color-scheme: dark)"), ':root:not([data-theme="light"])'));
const FALLBACK_DARK_FORCED = declarations(blockAfter(SUPPORTS, ':root[data-theme="dark"] {'));

describe("the palette", () => {
  it("is the app's cool palette (values copied from apps/web design tokens)", () => {
    const light = (name: string): string | undefined => PAIRS.get(name)?.light;
    const dark = (name: string): string | undefined => PAIRS.get(name)?.dark;
    expect([light("--c-bg"), dark("--c-bg")]).toEqual(["#f4f7fe", "#0b1220"]);
    expect([light("--c-surface"), dark("--c-surface")]).toEqual(["#ffffff", "#131c30"]);
    expect([light("--c-ink"), dark("--c-ink")]).toEqual(["#0e1a33", "#eaf0ff"]);
    expect([light("--c-ink-muted"), dark("--c-ink-muted")]).toEqual(["#4f5b78", "#a7b3cf"]);
    expect([light("--c-line"), dark("--c-line")]).toEqual(["#e1e7f5", "#25314b"]);
    expect([light("--c-line-strong"), dark("--c-line-strong")]).toEqual(["#7a86a5", "#66759a"]);
    expect([light("--c-primary"), dark("--c-primary")]).toEqual(["#1a5cff", "#3366f5"]);
    expect([light("--c-primary-tint"), dark("--c-primary-tint")]).toEqual(["#e8efff", "#18264a"]);
    expect([light("--c-ok"), dark("--c-ok")]).toEqual(["#0b7d41", "#34c77b"]);
    expect([light("--c-ok-tint"), dark("--c-ok-tint")]).toEqual(["#e2f6ea", "#0f2a1c"]);
    expect([light("--c-stop"), dark("--c-stop")]).toEqual(["#d92d20", "#ff6b5e"]);
    expect([light("--c-stop-ink"), dark("--c-stop-ink")]).toEqual(["#b8251a", "#ff8f84"]);
    expect([light("--c-stop-tint"), dark("--c-stop-tint")]).toEqual(["#fdecea", "#3a1714"]);
    expect([light("--c-focus"), dark("--c-focus")]).toEqual(["#1a5cff", "#93b4ff"]);
  });

  it("keeps the names the earlier page used, now pointing at the new palette", () => {
    for (const name of ["--ledger-bg", "--ledger-surface", "--ledger-ink", "--ledger-ink-soft", "--line-strong", "--hairline", "--focus", "--minted", "--stopped", "--pending"]) {
      expect(CSS, name).toContain(`${name}:`);
    }
    expect(norm(CSS)).toContain("--ledger-bg: var(--c-bg)");
  });
});

describe("the plain-value fallback (browsers without light-dark())", () => {
  it("has the light value of every pair", () => {
    for (const [name, pair] of PAIRS) expect(FALLBACK_LIGHT.get(name), name).toBe(pair.light);
  });

  it("has the dark value of every pair, for the system dark scheme and for data-theme=dark", () => {
    for (const [name, pair] of PAIRS) {
      expect(FALLBACK_DARK_MEDIA.get(name), `${name} (prefers-color-scheme)`).toBe(pair.dark);
      expect(FALLBACK_DARK_FORCED.get(name), `${name} (data-theme)`).toBe(pair.dark);
    }
  });

  it("holds nothing that is not a pair", () => {
    for (const block of [FALLBACK_LIGHT, FALLBACK_DARK_MEDIA, FALLBACK_DARK_FORCED]) {
      expect([...block.keys()].filter((name) => !PAIRS.has(name))).toEqual([]);
    }
  });
});

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** [foreground, background, minimum ratio]: text 4.5, graphics and control edges 3. */
const CONTRAST: readonly (readonly [string, string, number])[] = [
  ["--c-ink", "--c-bg", 4.5], ["--c-ink", "--c-surface", 4.5], ["--c-ink", "--c-surface-sunken", 4.5],
  ["--c-ink", "--c-ok-tint", 4.5], ["--c-ink", "--c-stop-tint", 4.5], ["--c-ink", "--c-primary-tint", 4.5],
  ["--c-ink-muted", "--c-bg", 4.5], ["--c-ink-muted", "--c-surface", 4.5], ["--c-ink-muted", "--c-surface-sunken", 4.5],
  ["--c-ink-muted", "--c-ok-tint", 4.5], ["--c-ink-muted", "--c-stop-tint", 4.5],
  ["--c-on-primary", "--c-primary", 4.5], ["--c-on-primary", "--c-primary-pressed", 4.5],
  ["--c-primary-ink", "--c-surface", 4.5], ["--c-primary-ink", "--c-bg", 4.5], ["--c-primary-ink", "--c-primary-tint", 4.5], ["--c-primary-ink", "--c-surface-sunken", 4.5],
  ["--c-ok-ink", "--c-surface", 4.5], ["--c-ok-ink", "--c-ok-tint", 4.5], ["--c-ok-ink", "--c-bg", 4.5],
  ["--c-stop-ink", "--c-surface", 4.5], ["--c-stop-ink", "--c-stop-tint", 4.5], ["--c-stop-ink", "--c-bg", 4.5],
  ["--c-on-ok", "--c-ok", 4.5], ["--c-on-stop", "--c-stop", 4.5],
  ["--sim", "--sim-bg", 4.5], ["--c-on-hero", "--c-hero-from", 4.5], ["--c-on-hero", "--c-hero-to", 4.5],
  ["--c-line-strong", "--c-surface", 3], ["--c-line-strong", "--c-bg", 3], ["--c-line-strong", "--c-surface-sunken", 3],
  ["--c-focus", "--c-bg", 3], ["--c-focus", "--c-surface", 3], ["--c-focus", "--c-ok-tint", 3], ["--c-focus", "--c-stop-tint", 3],
  ["--c-stop", "--c-stop-tint", 3], ["--c-stop", "--c-bg", 3], ["--c-ok", "--c-ok-tint", 3], ["--c-primary", "--c-bg", 3], ["--c-primary", "--c-surface", 3],
];

describe("contrast (WCAG AA) in both modes", () => {
  for (const mode of ["light", "dark"] as const) {
    it.each(CONTRAST)(`${mode}: %s on %s reaches %s:1`, (fg, bg, min) => {
      const colour = (name: string): string => {
        const value = PAIRS.get(name)?.[mode];
        if (value === undefined || !/^#[0-9a-f]{6}$/.test(value)) throw new Error(`${name} is not a hex pair`);
        return value;
      };
      expect(ratio(colour(fg), colour(bg))).toBeGreaterThanOrEqual(min);
    });
  }
});
