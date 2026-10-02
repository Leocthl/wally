// Guards over every stylesheet the Wally UI adds: colours only from token files, durations only from --dur tokens,
// loops only for motion that is switched off under reduced motion, inputs at 16 px, no glass, no remote assets.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const TOKEN_FILES = new Set(["design/tokens.css", "design/tokens-warm.css", "design/tokens-fallback.css"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sheets = walk(SRC)
  .filter((f) => f.endsWith(".css"))
  .map((f) => ({ file: relative(SRC, f), css: readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "") }));

/** Removes @media (prefers-reduced-motion: no-preference) { ... } blocks (balanced braces). */
function withoutMotionBlocks(css: string): string {
  const marker = "@media (prefers-reduced-motion: no-preference)";
  let out = css;
  for (let i = out.indexOf(marker); i !== -1; i = out.indexOf(marker)) {
    let depth = 0;
    let end = out.indexOf("{", i);
    for (let j = end; j < out.length; j += 1) {
      if (out[j] === "{") depth += 1;
      else if (out[j] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    out = out.slice(0, i) + out.slice(end + 1);
  }
  return out;
}

describe("stylesheets", () => {
  it("finds the Wally sheets", () => {
    expect(sheets.map((s) => s.file)).toEqual(expect.arrayContaining(["design/ui/button.css", "design/ui/overlay.css", "wally/wally.css", "screens/styleguide/styleguide.css"]));
  });

  it("use no raw colours outside the token files (hex, rgb, hsl, named)", () => {
    for (const { file, css } of sheets.filter((s) => !TOKEN_FILES.has(s.file))) {
      expect(css, file).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(css, file).not.toMatch(/\b(rgba?|hsla?|oklch|lab)\(/i);
      expect(css, file).not.toMatch(/:\s*(white|black|red|orange|blue|green)\b/i);
    }
  });

  it("take every animation and transition time from a --dur token", () => {
    for (const { file, css } of sheets) {
      for (const line of css.split("\n").filter((l) => /(^|[\s;{])(animation|transition)(-duration|-delay)?\s*:/.test(l))) {
        expect(line, `${file}: ${line.trim()}`).not.toMatch(/(^|[\s:,(])\d*\.?\d+m?s\b/);
      }
    }
  });

  it("loop only inside @media (prefers-reduced-motion: no-preference)", () => {
    for (const { file, css } of sheets) expect(withoutMotionBlocks(css), file).not.toMatch(/infinite/);
  });

  it("keep text inputs at 16 px or more (no iOS zoom)", () => {
    const form = sheets.find((s) => s.file === "design/ui/form.css")?.css ?? "";
    expect(form).toMatch(/\.w-field__input\s*\{[^}]*font-size:\s*max\(1rem/);
    expect(sheets.find((s) => s.file === "design/base.css")?.css).toMatch(/font-size:\s*1rem;/);
  });

  it("use no glass effects or remote assets", () => {
    for (const { file, css } of sheets) {
      expect(css, file).not.toMatch(/backdrop-filter/);
      expect(css, file).not.toMatch(/url\(/);
    }
  });

  it("keep z-index on the layer scale", () => {
    for (const { file, css } of sheets) for (const m of css.matchAll(/z-index:\s*([^;]+);/g)) expect(m[1], file).toMatch(/^var\(--z-[a-z]+\)$|^-?1$/);
  });
});
