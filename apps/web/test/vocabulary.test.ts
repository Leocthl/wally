// The words a person reads: budget, rules, one-off card, Stopped before paying, Needs your OK, Cancel this budget, Wally.
// The build-time words (packet, mandate, mint, Lai See, red packet, 利是) never reach the screen. Internal names keep them
// (types, scenario ids, rule and template ids, log fields, comments), so this walks the string tables only.
import { buildRules, DEFAULT_COMPILER_LIMITS, type RawRules } from "@wally/agent/compiler";
import { describe, expect, it } from "vitest";
import { compileMandate } from "../src/booth/compile";
import { DM8, DM9 } from "../src/evidence/dm9";
import { H } from "../src/evidence/humanStrings";
import { J } from "../src/evidence/judgeStrings";
import { METRICS } from "../src/evidence/metrics";
import { E } from "../src/evidence/strings";
import { S } from "../src/i18n/strings";
import { UI } from "../src/i18n/ui";

const BUILD_TIME_EN = /\b(packet|mandate|mint(ed|s|ing)?|lai[ -]?see|red packet)\b/i;
const BUILD_TIME_ZH = /利是|紅包/;
const NOW = new Date("2026-10-03T02:00:00Z");

/** Every English and zh-HK line under a table with its path. A label function is called with placeholder words. */
function lines(value: unknown, path = ""): readonly (readonly [string, string])[] {
  if (typeof value === "function") return lines(value("x", "x", "x", "x"), `${path}()`);
  if (value === null || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (typeof record["en"] === "string" && typeof record["zh"] === "string") return [[path, record["en"]], [path, record["zh"]]];
  return Object.entries(record).flatMap(([key, child]) => lines(child, path === "" ? key : `${path}.${key}`));
}

const compileMessages = ["buy me some clothes", "HK$0 this month for clothes", "HK$800 this month for spaceships", "HK$800 for clothes in 0 days"].map((s) => compileMandate(s, NOW).issues);

/** The model compiler's notes and clamps, which the Seal screen shows as they are. Clamps are English only. */
const RAW: RawRules = {
  budgetHkd: 800, categories: ["apparel"], period: "not_stated", periodCount: null, sellers: "not_stated", capHkd: null, askAboveHkd: null,
  sharePercent: null, maxPurchases: null, per: "not_stated", endMonth: null, endDay: null,
};
const compilerWords = [{}, { period: "weeks", periodCount: 12 }, { endMonth: 12, endDay: 31 }, { endMonth: 11, endDay: null }].flatMap((over) => {
  const built = buildRules({ ...RAW, ...over } as RawRules, ["apparel"], NOW, DEFAULT_COMPILER_LIMITS);
  return built.ok ? [...built.notes.map((n) => ({ en: n.en, zh: n.zhHK })), ...built.clamped.map((c) => ({ en: `${c.asked}; ${c.applied}; ${c.why}`, zh: c.why }))] : [];
});

const TABLES: readonly (readonly [string, unknown])[] = [
  ["UI (i18n/ui.ts)", UI],
  ["S (i18n/strings.ts)", S],
  ["E (evidence/strings.ts)", E],
  ["J (evidence/judgeStrings.ts)", J],
  ["H (evidence/humanStrings.ts)", H],
  ["DM8 and DM9 (evidence/dm9.ts)", [DM8, DM9]],
  ["METRICS (evidence/metrics.ts)", METRICS],
  ["the sentence reader's errors (booth/compile.ts)", compileMessages],
  ["the model compiler's notes and clamps (agent/compiler/rules.ts)", compilerWords],
];

describe("words a person reads", () => {
  it.each(TABLES)("%s holds no build-time word", (_name, table) => {
    const all = lines(table);
    expect(all.length).toBeGreaterThan(0);
    const found = all.filter(([, text]) => BUILD_TIME_EN.test(text) || BUILD_TIME_ZH.test(text)).map(([path, text]) => `${path}: ${text}`);
    expect(found).toEqual([]);
  });

  it("finds the lines it is meant to guard, label functions included", () => {
    const all = lines(UI);
    expect(all.some(([path]) => path.endsWith("()"))).toBe(true);
    expect(all.some(([, text]) => /Cancel this budget/.test(text))).toBe(true);
    expect(lines(compileMessages).length).toBeGreaterThanOrEqual(4);
    // Both notes and the clamp reason are in the table, and each says budget.
    const compiler = lines(compilerWords).map(([, text]) => text);
    expect(compiler.some((t) => t.includes("the budget ends at the end of this month"))).toBe(true);
    expect(compiler.some((t) => t.includes("預算在本月底"))).toBe(true);
    expect(compiler.some((t) => t.includes("a budget runs at most 31 days"))).toBe(true);
  });

  it("would catch a build-time word", () => {
    for (const bad of ["Packet left", "The mandate was revoked", "A card was minted", "Lai See Agent", "A red packet", "剩餘利是"]) {
      expect(BUILD_TIME_EN.test(bad) || BUILD_TIME_ZH.test(bad), bad).toBe(true);
    }
    for (const good of ["Budget left", "Cancel this budget", "One-off card", "Needs your OK", "peppermint tea"]) {
      expect(BUILD_TIME_EN.test(good) || BUILD_TIME_ZH.test(good), good).toBe(false);
    }
  });
});
