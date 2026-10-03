// The words of the first run: no build-time word reaches the screen, every line has both languages, and the lines that name
// money hold no digit (figures go through the formatter and wear a chip).
import { describe, expect, it } from "vitest";
import { ASK_EXAMPLES, OB } from "../src/i18n/onboarding";

const BUILD_TIME_EN = /\b(packet|mandate|mint(ed|s|ing)?|lai[ -]?see|red packet)\b/i;
const BUILD_TIME_ZH = /利是|紅包/;

function lines(value: unknown, path = ""): readonly (readonly [string, string, string])[] {
  if (typeof value === "function") return lines(value("x", "x", "x", "x"), `${path}()`);
  if (value === null || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (typeof record["en"] === "string" && typeof record["zh"] === "string") return [[path, record["en"], record["zh"]]];
  return Object.entries(record).flatMap(([key, child]) => lines(child, path === "" ? key : `${path}.${key}`));
}

const all = [...lines(OB), ...lines(ASK_EXAMPLES, "ask")];

describe("the first run's words", () => {
  it("has a good number of lines, in both languages", () => {
    expect(all.length).toBeGreaterThan(80);
    for (const [path, en, zh] of all) {
      expect(en.trim(), path).not.toBe("");
      expect(zh.trim(), path).not.toBe("");
    }
  });

  it("holds no build-time word", () => {
    const found = all.filter(([, en, zh]) => BUILD_TIME_EN.test(en) || BUILD_TIME_ZH.test(zh)).map(([path, en]) => `${path}: ${en}`);
    expect(found).toEqual([]);
  });

  it("holds no digit and no em dash (figures come from the formatter)", () => {
    const found = all.filter(([, en, zh]) => /\d/.test(en) || /\d/.test(zh) || en.includes("—") || zh.includes("—")).map(([path, en]) => `${path}: ${en}`);
    expect(found).toEqual([]);
  });

  it("uses the product words: budget, Wally, rules (never packet, mandate or mint)", () => {
    const text = all.map(([, en]) => en).join(" ");
    expect(text).toMatch(/budget/);
    expect(text).toMatch(/Wally/);
    expect(text).toMatch(/rules/);
  });
});
