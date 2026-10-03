// The words of the photo feature: both languages everywhere, the build-time words and em dashes nowhere, and names built
// from the typed fields the same way on every screen.
import { COLORS, KINDS, PATTERNS, STYLES } from "@wally/agent/vision";
import { describe, expect, it } from "vitest";
import { COLOR_WORDS, colorPhrase, FIT_WORDS, itemName, KIND_WORDS, PATTERN_WORDS, PHOTO, REASON_WORDS, reasonLine, seesPhrase, STYLE_WORDS } from "../src/i18n/photo";

const BUILD_TIME = /\b(packet|mandate|mint(ed|s|ing)?|lai[ -]?see|red packet)\b/i;
const BUILD_TIME_ZH = /利是|紅包/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

/** Every English and zh-HK line under a table; a label function is called with placeholder words. */
function lines(value: unknown, path = ""): readonly (readonly [string, string])[] {
  if (typeof value === "function") return lines(value("x", "x", "x"), `${path}()`);
  if (value === null || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (typeof record["en"] === "string" && typeof record["zh"] === "string") return [[path, record["en"]], [path, record["zh"]]];
  return Object.entries(record).flatMap(([key, child]) => lines(child, path === "" ? key : `${path}.${key}`));
}

const TABLES: readonly (readonly [string, unknown])[] = [
  ["PHOTO", PHOTO],
  ["KIND_WORDS", KIND_WORDS],
  ["COLOR_WORDS", COLOR_WORDS],
  ["PATTERN_WORDS", PATTERN_WORDS],
  ["FIT_WORDS", FIT_WORDS],
  ["STYLE_WORDS", STYLE_WORDS],
  ["REASON_WORDS", REASON_WORDS],
];

describe("photo words", () => {
  it.each(TABLES)("%s has an English and a Chinese line everywhere, with no build-time word, em dash or emoji", (_name, table) => {
    const all = lines(table);
    expect(all.length).toBeGreaterThan(0);
    for (const [path, text] of all) {
      expect(text, path).not.toBe("");
      expect(text, path).not.toMatch(BUILD_TIME);
      expect(text, path).not.toMatch(BUILD_TIME_ZH);
      expect(text, path).not.toContain("—");
      expect(text, path).not.toMatch(EMOJI);
    }
    for (let i = 0; i < all.length; i += 2) expect(all[i]?.[1], all[i]?.[0]).not.toBe(all[i + 1]?.[1]);
  });

  it("names every kind, colour, pattern and style the model or the shop can use", () => {
    for (const kind of KINDS) expect(KIND_WORDS[kind]).toBeDefined();
    for (const color of COLORS) expect(COLOR_WORDS[color]).toBeDefined();
    for (const pattern of PATTERNS) expect(PATTERN_WORDS[pattern]).toBeDefined();
    for (const style of STYLES) expect(STYLE_WORDS[style]).toBeDefined();
  });

  it("says the privacy line in the words that are true for this booth", () => {
    expect(PHOTO.privacyDevice.en).toBe("Your picture stays on this device and is not saved.");
    expect(PHOTO.privacyModel.en).toMatch(/booth Mac/);
    expect(PHOTO.privacyModel.en).toMatch(/not saved/);
  });

  it("uses the user-facing vocabulary: budget and rules, never packet or mandate", () => {
    const all = lines(PHOTO).map(([, text]) => text).join("\n");
    expect(all).toMatch(/rules/);
    expect(all).not.toMatch(BUILD_TIME);
  });
});

describe("names from typed words", () => {
  const hoodie = { kind: "hoodie", colors: ["navy"], pattern: "plain", fit: "relaxed" } as const;

  it("builds the item name in English and Chinese", () => {
    expect(itemName("en", hoodie)).toBe("Navy relaxed hoodie");
    expect(itemName("zh-HK", hoodie)).toBe("海軍藍寬鬆衛衣");
    expect(itemName("en", { kind: "tee", colors: ["cream"], pattern: "print", fit: "relaxed" })).toBe("Cream relaxed print tee");
    expect(itemName("en", { kind: "sneakers", colors: ["white"], pattern: "plain", fit: "regular" })).toBe("White sneakers");
    expect(itemName("en", { kind: "tee", colors: [], pattern: null, fit: null })).toBe("Tee");
  });

  it("says what Wally sees from the typed fields", () => {
    expect(seesPhrase("en", hoodie)).toBe("navy, relaxed hoodie");
    expect(seesPhrase("en", { ...hoodie, colors: ["navy", "white", "red"] })).toBe("navy and white, relaxed hoodie");
    expect(seesPhrase("zh-HK", { ...hoodie, colors: ["navy", "white"] })).toBe("海軍藍同白色，寬鬆衛衣");
    expect(seesPhrase("en", { kind: null, colors: ["navy"], pattern: null, fit: null })).toBe("navy");
    expect(PHOTO.sees("navy, relaxed hoodie").en).toBe("Wally sees: navy, relaxed hoodie");
    expect(colorPhrase("en", [])).toBe("");
  });

  it("words the reasons from their ids, two at most", () => {
    expect(reasonLine("en", ["same_kind", "close_color", "same_fit"])).toBe("Same type, close colour");
    expect(reasonLine("zh-HK", ["same_kind", "close_color"])).toBe("同類型，顏色相近");
    expect(reasonLine("en", ["same_color"])).toBe("Same colour");
    expect(reasonLine("en", [])).toBe("");
  });
});
