// POST /api/compile when the fixed rules parser answers (no model, or the model failed): a date in the sentence ends the
// budget there, the chip labels say so, and a date further off than a budget may run carries the same clamp the model
// compiler gives. The model's own end date handling is covered in packages/agent (compiler-end-date.test.ts).
import { describe, expect, it } from "vitest";
import { BoothError } from "../src/booth/backend/errors";
import { compileRules } from "../src/booth/backend/compileRules";

const NOW = new Date("2026-10-03T02:00:00Z"); // 10:00 on 3 Oct in Hong Kong
const read = (text: string, locale: "en" | "zh-HK" = "en") => compileRules({ text, locale }, { now: NOW, model: null });
const expiryLabel = (r: Awaited<ReturnType<typeof read>>) => r.labels.find((l) => l.kind === "expiry");

describe("the fixed rules parser reads a stated end date", () => {
  it.each([
    ["HK$800 for clothes until 31 Oct", "en", "Until 31 Oct", "至10月31日"],
    ["HK$800 for clothes by 2026-10-31", "en", "Until 31 Oct", "至10月31日"],
    ["HK$800 for clothes, 10月31日前", "zh-HK", "Until 31 Oct", "至10月31日"],
    ["HK$800 for clothes, 十月底前", "zh-HK", "Until 31 Oct", "至10月31日"],
    ["HK$800 for clothes until 20 Oct", "en", "Until 20 Oct", "至10月20日"],
  ] as const)("%s", async (text, locale, en, zhHK) => {
    const result = await read(text, locale);
    expect(result.source).toBe("rules");
    expect(Date.parse(result.validUntil)).toBeGreaterThan(NOW.getTime());
    expect(expiryLabel(result)).toMatchObject({ en, zhHK });
    expect(result.validUntil).toMatch(/^2026-10-(20|31)T15:59:59Z$/);
    expect(result.clamped).toEqual([]);
    expect(result.confirmRequired).toBe(true);
  });

  it("a date further off than a budget may run is cut to 31 days, and the clamp is said in plain words", async () => {
    const result = await read("HK$800 for clothes until 31 Dec");
    expect(result.validUntil).toBe("2026-11-03T02:00:00Z");
    expect(expiryLabel(result)).toMatchObject({ en: "Until 3 Nov", zhHK: "至11月3日" });
    expect(result.clamped).toEqual(["The end date is cut to 31 days from now, the longest a budget can run."]);
    expect(result.notes).toEqual(["Read by the fixed rules parser, not a model."]);
  });

  it("the clamp is never the developer line (field names, asked and applied), in either language, from either reader", async () => {
    const zh = await read("HK$800 for clothes, 至2026年12月31日", "zh-HK");
    expect(zh.clamped).toEqual(["結束日期已縮短至由今日起 31 日，這是一個預算最長可維持的日數。"]);
    const model = await compileRules(
      { text: "HK$800 for clothes until 31 Dec", locale: "en" },
      { now: NOW, model: async () => ({ ok: true, rules: { budget: { amount_minor: 80_000, currency: "HKD" }, categories: ["apparel"], merchants: { allow: null, deny: [] }, seller_check: { require_capture: true } }, validUntil: "2026-11-03T02:00:00Z", labels: [], notes: [], clamped: [{ field: "budget.amount_minor", asked: "HK$5000", applied: "HK$2000", why: "one card's limit ceiling [F1]" }, { field: "valid_until", asked: "31 Dec", applied: "31 days", why: "a budget runs at most 31 days" }], confirmRequired: true, source: "generative", model: "m", latencyMs: 1 }) },
    );
    expect(model.clamped).toEqual(["You asked for HK$5000; Wally used HK$2000 instead (one card's limit ceiling).", "The end date is cut to 31 days from now, the longest a budget can run."]);
    for (const line of [...zh.clamped, ...model.clamped]) expect(line).not.toMatch(/valid_until|amount_minor|asked \w+, applied|\[F\d+/);
  });

  it("a date that is not on the calendar, or no date at all, is the end of this month", async () => {
    for (const text of ["HK$800 for clothes until 31 Feb", "HK$800 for clothes"]) {
      const result = await read(text);
      expect(result.validUntil, text).toBe("2026-10-31T15:59:59Z");
      expect(result.clamped, text).toEqual([]);
    }
  });

  it("still refuses a sentence with no amount, and a zero-day length", async () => {
    await expect(read("something nice for clothes until 31 Oct")).rejects.toBeInstanceOf(BoothError);
    await expect(read("HK$800 for clothes in 0 days")).rejects.toMatchObject({ status: 422, code: "CANNOT_COMPILE" });
  });

  it("the fallback after a failed model read gives the same end", async () => {
    const failed = { ok: false, reason: "model_unavailable", latencyMs: 0 } as const;
    const result = await compileRules({ text: "HK$800 for clothes until 20 Oct", locale: "en" }, { now: NOW, model: async () => failed });
    expect(result.source).toBe("rules");
    expect(result.validUntil).toBe("2026-10-20T15:59:59Z");
    expect(result.notes[0]).toContain("could not read this sentence (model_unavailable)");
  });
});
