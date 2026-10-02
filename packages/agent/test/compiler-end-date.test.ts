// A calendar end date for the sentence compiler: resolved in Hong Kong time as the next time it comes round, capped at
// the longest period a sentence may set, and carried by two typed fields of the model's answer (end_month, end_day).
// The same maths serves the Seal screen's fixed rules parser, so both read a stated date the same way.
import { describe, expect, it } from "vitest";
import { parseCompilerAnswer } from "../src/compiler/answer";
import { DEFAULT_COMPILER_LIMITS } from "../src/compiler/config";
import { capEnd, describeEndDate, isRealDate, resolveEndDate } from "../src/compiler/end-date";
import { buildCompilerSchema, COMPILER_SYSTEM_PROMPT } from "../src/compiler/prompt";
import { buildRules, type RawRules } from "../src/compiler/rules";

const NOW = new Date("2026-10-03T02:00:00Z"); // 10:00 on 3 Oct in Hong Kong
const SLUGS = ["apparel", "footwear", "electronics", "groceries"];
const LIMITS = DEFAULT_COMPILER_LIMITS;
const iso = (ms: number): string => new Date(ms).toISOString();

describe("isRealDate", () => {
  it.each([
    [{ month: 10, day: 31 }, true],
    [{ month: 2, day: 29 }, true], // a leap day exists in some year
    [{ month: 2, day: 30 }, false],
    [{ month: 2, day: 31 }, false],
    [{ month: 4, day: 31 }, false],
    [{ month: 6, day: 31 }, false],
    [{ month: 9, day: 31 }, false],
    [{ month: 11, day: 31 }, false],
    [{ month: 12, day: 31 }, true],
    [{ month: 11, day: null }, true],
    [{ month: 13, day: null }, false],
    [{ month: 0, day: null }, false],
    [{ month: 10, day: 0 }, false],
    [{ month: 10, day: 32 }, false],
    [{ month: 1.5, day: null }, false],
    [{ month: 10, day: 3.5 }, false],
  ])("%j is %s", (end, real) => {
    expect(isRealDate(end)).toBe(real);
  });
});

describe("resolveEndDate: 23:59:59 Hong Kong time, the next time the date comes round", () => {
  it("a day later this month", () => {
    const end = resolveEndDate({ month: 10, day: 31 }, NOW);
    expect(end && iso(end.endMs)).toBe("2026-10-31T15:59:59.000Z");
    expect(end?.hkDay).toBe("2026-10-31");
  });

  it("a day in a later month this year", () => {
    expect(resolveEndDate({ month: 12, day: 15 }, NOW)?.hkDay).toBe("2026-12-15");
  });

  it("today still counts until its last second in Hong Kong", () => {
    const end = resolveEndDate({ month: 10, day: 3 }, NOW);
    expect(end && iso(end.endMs)).toBe("2026-10-03T15:59:59.000Z");
    // 23:59:58 in Hong Kong is still today; 23:59:59 has gone.
    expect(resolveEndDate({ month: 10, day: 3 }, new Date("2026-10-03T15:59:58Z"))?.hkDay).toBe("2026-10-03");
    expect(resolveEndDate({ month: 10, day: 3 }, new Date("2026-10-03T15:59:59Z"))?.hkDay).toBe("2027-10-03");
  });

  it("reads the Hong Kong calendar, not UTC", () => {
    // 17:30 UTC on 3 Oct is already 4 Oct in Hong Kong, so 3 Oct has passed.
    expect(resolveEndDate({ month: 10, day: 3 }, new Date("2026-10-03T17:30:00Z"))?.hkDay).toBe("2027-10-03");
    expect(resolveEndDate({ month: 10, day: 4 }, new Date("2026-10-03T17:30:00Z"))?.hkDay).toBe("2026-10-04");
  });

  it("rolls to next year when the date has already passed", () => {
    expect(resolveEndDate({ month: 10, day: 2 }, NOW)?.hkDay).toBe("2027-10-02");
    expect(resolveEndDate({ month: 9, day: 1 }, NOW)?.hkDay).toBe("2027-09-01");
    expect(resolveEndDate({ month: 1, day: 15 }, NOW)?.hkDay).toBe("2027-01-15");
  });

  it("no day means the last day of that month", () => {
    expect(resolveEndDate({ month: 10, day: null }, NOW)?.hkDay).toBe("2026-10-31");
    expect(resolveEndDate({ month: 11, day: null }, NOW)?.hkDay).toBe("2026-11-30");
    expect(resolveEndDate({ month: 12, day: null }, NOW)?.hkDay).toBe("2026-12-31");
  });

  it("the end of a month that has passed is next year's, with February's own length", () => {
    expect(resolveEndDate({ month: 2, day: null }, NOW)?.hkDay).toBe("2027-02-28");
    expect(resolveEndDate({ month: 2, day: null }, new Date("2027-10-03T02:00:00Z"))?.hkDay).toBe("2028-02-29");
    expect(resolveEndDate({ month: 2, day: null }, new Date("2028-01-10T02:00:00Z"))?.hkDay).toBe("2028-02-29");
  });

  it("29 February waits for the next leap year", () => {
    expect(resolveEndDate({ month: 2, day: 29 }, NOW)?.hkDay).toBe("2028-02-29");
    expect(resolveEndDate({ month: 2, day: 29 }, new Date("2028-01-10T02:00:00Z"))?.hkDay).toBe("2028-02-29");
  });

  it("a date that does not exist has no end", () => {
    expect(resolveEndDate({ month: 2, day: 31 }, NOW)).toBeNull();
    expect(resolveEndDate({ month: 2, day: 30 }, NOW)).toBeNull();
    expect(resolveEndDate({ month: 11, day: 31 }, NOW)).toBeNull();
    expect(resolveEndDate({ month: 13, day: null }, NOW)).toBeNull();
    expect(resolveEndDate({ month: 10, day: 0 }, NOW)).toBeNull();
  });

  it("an invalid clock has no end", () => {
    expect(resolveEndDate({ month: 10, day: 31 }, new Date(Number.NaN))).toBeNull();
  });
});

describe("describeEndDate: the date as the sentence asked for it", () => {
  it.each([
    [{ month: 10, day: 31 }, "31 Oct"],
    [{ month: 1, day: 5 }, "5 Jan"],
    [{ month: 11, day: null }, "end of November"],
    [{ month: 2, day: null }, "end of February"],
  ])("%j reads %j", (end, text) => {
    expect(describeEndDate(end)).toBe(text);
  });
});

describe("capEnd: a budget runs at most the longest period from now", () => {
  it("keeps an end inside the cap", () => {
    const end = Date.parse("2026-10-31T15:59:59Z");
    expect(capEnd(end, NOW, 31)).toEqual({ endMs: end, capped: false });
  });

  it("cuts an end beyond the cap to that many days from now", () => {
    const end = Date.parse("2026-12-31T15:59:59Z");
    const capped = capEnd(end, NOW, 31);
    expect(capped.capped).toBe(true);
    expect(iso(capped.endMs)).toBe("2026-11-03T02:00:00.000Z");
  });

  it("an end exactly at the cap is kept", () => {
    const edge = NOW.getTime() + 31 * 86_400_000;
    expect(capEnd(edge, NOW, 31)).toEqual({ endMs: edge, capped: false });
    expect(capEnd(edge + 1, NOW, 31).capped).toBe(true);
  });
});

const raw = (over: Partial<RawRules> = {}): RawRules => ({
  budgetHkd: 800, categories: ["apparel"], period: "not_stated", periodCount: null, sellers: "verified_only",
  capHkd: null, askAboveHkd: null, sharePercent: null, maxPurchases: null, per: "not_stated", endMonth: null, endDay: null, ...over,
});

function built(over: Partial<RawRules>) {
  const out = buildRules(raw(over), SLUGS, NOW, LIMITS);
  if (!out.ok) throw new Error(`buildRules failed: ${out.reason}`);
  return out;
}

describe("buildRules: a stated end date", () => {
  it("until 31 Oct ends at 23:59:59 Hong Kong time on that day, with no note and no clamp", () => {
    const out = built({ endMonth: 10, endDay: 31 });
    expect(out.validUntil).toBe("2026-10-31T15:59:59Z");
    expect(out.notes).toEqual([]);
    expect(out.clamped).toEqual([]);
  });

  it("the end of November has no day (the last day of the month); it is 58 days away, so the clamp names it as asked", () => {
    const out = built({ endMonth: 11, endDay: null });
    expect(out.validUntil).toBe("2026-11-03T02:00:00Z");
    expect(out.clamped).toEqual([{ field: "valid_until", asked: "end of November", applied: "31 days", why: "a budget runs at most 31 days" }]);
  });

  it("the end of this month is a month-end default the cap never touches", () => {
    const out = built({ endMonth: 10, endDay: null });
    expect(out.validUntil).toBe("2026-10-31T15:59:59Z");
    expect(out.clamped).toEqual([]);
  });

  it("clamps a date more than 31 days away, saying what was asked and why", () => {
    const out = built({ endMonth: 12, endDay: 31 });
    expect(out.validUntil).toBe("2026-11-03T02:00:00Z");
    expect(out.clamped).toEqual([{ field: "valid_until", asked: "31 Dec", applied: "31 days", why: "a budget runs at most 31 days" }]);
    expect(out.notes.some((n) => /end date/i.test(n.en))).toBe(false);
  });

  it("a date already past this year is next year's, then clamped", () => {
    const out = built({ endMonth: 9, endDay: 1 });
    expect(out.validUntil).toBe("2026-11-03T02:00:00Z");
    expect(out.clamped).toEqual([expect.objectContaining({ field: "valid_until", asked: "1 Sep", applied: "31 days" })]);
  });

  it("a date that is 31 days away to the day is kept", () => {
    // 3 Nov 15:59:59 in Hong Kong is a little over 31 days from 3 Oct 10:00, so 2 Nov is the last one that fits whole.
    const out = built({ endMonth: 11, endDay: 2 });
    expect(out.validUntil).toBe("2026-11-02T15:59:59Z");
    expect(out.clamped).toEqual([]);
  });

  it("a date that does not exist falls back to the month-end default, with the note", () => {
    const out = built({ endMonth: 2, endDay: 31 });
    expect(out.validUntil).toBe("2026-10-31T15:59:59Z");
    expect(out.notes.map((n) => n.en)).toContain("No end date in the sentence: the budget ends at the end of this month (HK time).");
    expect(out.clamped).toEqual([]);
  });

  it("a day without a month is no date at all", () => {
    const out = built({ endMonth: null, endDay: 15 });
    expect(out.validUntil).toBe("2026-10-31T15:59:59Z");
    expect(out.notes.map((n) => n.en)).toContain("No end date in the sentence: the budget ends at the end of this month (HK time).");
  });

  it("the earlier end wins when the sentence gives a length and a date, so a budget is never lengthened", () => {
    expect(built({ period: "days", periodCount: 7, endMonth: 10, endDay: 31 }).validUntil).toBe("2026-10-10T02:00:00Z");
    expect(built({ period: "days", periodCount: 30, endMonth: 10, endDay: 20 }).validUntil).toBe("2026-10-20T15:59:59Z");
    expect(built({ period: "this_month", endMonth: 11, endDay: 15 }).validUntil).toBe("2026-10-31T15:59:59Z");
  });

  it("a stated date alone leaves the sellers note and nothing about the end", () => {
    const out = built({ sellers: "not_stated", endMonth: 10, endDay: 20 });
    expect(out.notes.map((n) => n.en)).toEqual(["Sellers not mentioned: verified sellers only (the safe default)."]);
  });
});

describe("buildRules: the old periods keep their behaviour, in the budget's own words", () => {
  it("no date and no length: the end of this month, with the note", () => {
    const out = built({});
    expect(out.validUntil).toBe("2026-10-31T15:59:59Z");
    expect(out.notes.map((n) => n.en)).toContain("No end date in the sentence: the budget ends at the end of this month (HK time).");
    expect(out.notes.map((n) => n.zhHK)).toContain("句子沒有寫結束日期：預算在本月底（香港時間）結束。");
  });

  it("this month needs no note", () => {
    const out = built({ period: "this_month" });
    expect(out.validUntil).toBe("2026-10-31T15:59:59Z");
    expect(out.notes).toEqual([]);
  });

  it("twelve weeks is clamped to 31 days with a budget in the reason", () => {
    const out = built({ period: "weeks", periodCount: 12 });
    expect(out.validUntil).toBe("2026-11-03T02:00:00Z");
    expect(out.clamped).toEqual([{ field: "valid_until", asked: "84 days", applied: "31 days", why: "a budget runs at most 31 days" }]);
  });

  it("neither a note nor a clamp says packet, in either language", () => {
    const words = [built({}), built({ endMonth: 12, endDay: 31 }), built({ period: "weeks", periodCount: 12 })]
      .flatMap((o) => [...o.notes.flatMap((n) => [n.en, n.zhHK]), ...o.clamped.flatMap((c) => [c.asked, c.applied, c.why])]);
    expect(words.length).toBeGreaterThan(3);
    for (const w of words) expect(w).not.toMatch(/packet|利是|紅包/i);
    expect(built({}).notes.map((n) => n.zhHK).join(" ")).toContain("預算");
  });
});

const ANSWER = { budget_hkd: 800, categories: ["apparel"], period: "not_stated", period_count: null, sellers: "verified_only" };
const parse = (fields: Record<string, unknown>) => parseCompilerAnswer(JSON.stringify({ ...ANSWER, ...fields }));

describe("parseCompilerAnswer: end_month and end_day", () => {
  it("reads both, a month alone, and neither; absent reads as null so an older answer still parses", () => {
    expect(parse({ end_month: 10, end_day: 31 })).toMatchObject({ endMonth: 10, endDay: 31 });
    expect(parse({ end_month: 11, end_day: null })).toMatchObject({ endMonth: 11, endDay: null });
    expect(parse({ end_month: null, end_day: null })).toMatchObject({ endMonth: null, endDay: null });
    expect(parse({})).toMatchObject({ endMonth: null, endDay: null });
  });

  it.each([
    ["a month of 0", { end_month: 0 }],
    ["a month of 13", { end_month: 13 }],
    ["a negative month", { end_month: -1 }],
    ["a day of 0", { end_month: 10, end_day: 0 }],
    ["a day of 32", { end_month: 10, end_day: 32 }],
    ["a fractional month", { end_month: 10.5 }],
    ["a fractional day", { end_month: 10, end_day: 3.5 }],
    ["a month as text", { end_month: "10" }],
    ["a day as text", { end_month: 10, end_day: "31" }],
    ["a date as one string", { end_month: "2026-10-31" }],
    ["a boolean", { end_month: true }],
    ["an object", { end_month: { value: 10 } }],
    ["a huge number", { end_month: 1e21 }],
  ])("fails the whole answer on %s", (_name, fields) => {
    expect(parse(fields)).toBeNull();
  });

  it("drops a date that is not on the calendar and keeps the rest of the answer", () => {
    for (const fields of [{ end_month: 2, end_day: 31 }, { end_month: 4, end_day: 31 }, { end_month: 2, end_day: 30 }, { end_month: null, end_day: 15 }]) {
      expect(parse(fields)).toMatchObject({ budgetHkd: 800, categories: ["apparel"], endMonth: null, endDay: null });
    }
    expect(parse({ end_month: 2, end_day: 29 })).toMatchObject({ endMonth: 2, endDay: 29 });
  });
});

describe("the prompt and the grammar", () => {
  const schema = buildCompilerSchema(SLUGS) as { required: string[]; properties: Record<string, { anyOf: readonly Record<string, unknown>[] }> };

  it("bounds end_month to 1..12 and end_day to 1..31, each nullable, and leaves them optional", () => {
    expect(schema.properties["end_month"]?.anyOf).toEqual([{ type: "integer", minimum: 1, maximum: 12 }, { type: "null" }]);
    expect(schema.properties["end_day"]?.anyOf).toEqual([{ type: "integer", minimum: 1, maximum: 31 }, { type: "null" }]);
    expect(schema.required).not.toContain("end_month");
    expect(schema.required).not.toContain("end_day");
  });

  it("teaches the three examples and tells the model to leave anything else null", () => {
    expect(COMPILER_SYSTEM_PROMPT).toMatch(/end_month and end_day/);
    expect(COMPILER_SYSTEM_PROMPT).toContain("'until 31 Oct' is end_month 10, end_day 31");
    expect(COMPILER_SYSTEM_PROMPT).toContain("'until the end of November' is end_month 11, end_day null");
    expect(COMPILER_SYSTEM_PROMPT).toContain("十月底前");
    expect(COMPILER_SYSTEM_PROMPT).toMatch(/otherwise null/i);
  });

  it("keeps a date that belongs to something else out of the end date", () => {
    expect(COMPILER_SYSTEM_PROMPT).toMatch(/shipping|delivery|sale/i);
  });
});
