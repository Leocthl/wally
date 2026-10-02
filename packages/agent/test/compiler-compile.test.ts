// Sentence-to-rules compiler against the offline mock llama-server: the model's typed fields become rules in
// code, clamps and defaults never loosen anything, labels come from code, and every failure is { ok: false }
// so the Seal screen falls back to the rule-based compile. Mandate M0, M1, M2 sentences: docs/01, compile.test.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CompiledRules } from "@laisee/core/generated";
import { validateMandate } from "@laisee/core/schema";
import { loadFixture } from "@laisee/core/testing/fixtures";
import { compileMandateText, type CompileOutcome } from "../src/compiler";
import { createChatClient, type ChatClient } from "../src/planner/local";
import { startMockLlama, userMessage, type MockLlama } from "./support/qwen/mock-llama";

let mock: MockLlama;
beforeAll(async () => {
  mock = await startMockLlama();
});
afterAll(async () => {
  await mock.close();
});
beforeEach(() => mock.reset());

const NOW = new Date("2026-10-03T02:00:00Z");
const M0_RULES: CompiledRules = loadFixture("mandate/m0.json", "mandate").rules; // HK$800 [F20]
const M0 = "HK$800 this month for clothes, verified sellers only";

function answer(fields: Record<string, unknown>): void {
  const base = { budget_hkd: 800, categories: ["apparel"], period: "this_month", period_count: null, sellers: "verified_only" };
  mock.set({ answer: () => JSON.stringify({ ...base, ...fields }) });
}

async function compile(text = M0, extra: { readonly client?: ChatClient; readonly timeoutMs?: number } = {}): Promise<CompileOutcome> {
  return compileMandateText({ text, locale: "en", client: extra.client ?? createChatClient({ baseUrl: mock.url }), now: NOW, ...(extra.timeoutMs === undefined ? {} : { timeoutMs: extra.timeoutMs }) });
}

function ok(out: CompileOutcome): Extract<CompileOutcome, { ok: true }> {
  if (!out.ok) throw new Error(`compile failed: ${out.reason}`);
  return out;
}

describe("M0, M1, M2 agree with the rule-based compile", () => {
  it("M0: HK$800, clothes, verified sellers, month end in HK time [F20]", async () => {
    answer({});
    const out = ok(await compile());
    expect(out.rules).toEqual(M0_RULES);
    expect(out.validUntil).toBe("2026-10-31T15:59:59Z");
    expect(out.clamped).toEqual([]);
    expect(out.notes).toEqual([]);
    expect(out.confirmRequired).toBe(true);
    expect(out.labels.map((l) => [l.kind, l.en, l.zhHK])).toEqual([
      ["budget", "HK$800 budget", "預算 HK$800"],
      ["expiry", "Until 31 Oct", "至10月31日"],
      ["category", "Clothes only", "只限衣服"],
      ["sellers", "Verified sellers only", "只限已驗證賣家"],
    ]);
  });

  it("M1: half of what is left per purchase [F90]", async () => {
    answer({ share_percent: 50 });
    const out = ok(await compile("HK$800 this month for clothes, verified sellers only, no single purchase above half of what is left"));
    expect(out.rules.per_purchase).toEqual({ share_of_remaining_bp: 5000 });
    expect(out.labels.at(-1)).toMatchObject({ kind: "share", en: "Max half of what is left per purchase" });
  });

  it("M2: seven days from the seal, ask above HK$300 [F90]", async () => {
    answer({ period: "days", period_count: 7, ask_above_hkd: 300 });
    const out = ok(await compile("HK$800 for clothes over the next 7 days, verified sellers only; ask me above HK$300"));
    expect(out.rules.budget.amount_minor).toBe(80_000);
    expect(out.rules.per_purchase).toEqual({ ask_above_minor: 30_000 });
    expect(out.validUntil).toBe("2026-10-10T02:00:00Z");
    expect(out.labels.map((l) => l.en)).toContain("Ask me above HK$300");
    expect(out.labels.find((l) => l.kind === "expiry")?.en).toBe("Until 10 Oct");
  });

  it("produces rules that pass the mandate schema", async () => {
    answer({ categories: ["apparel", "footwear"], cap_hkd: 300, max_purchases: 2, per: "day" });
    const out = ok(await compile("HK$800 for clothes and shoes, at most HK$300 each, 2 purchases a day"));
    const mandate = { id: "mnd_test01", delegator: "did:key:z6MkDemoDeLegatorKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXX", agent: "did:key:z6MkDemoAgentKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", intent_text: "x", rules: out.rules, valid_from: "2026-10-03T02:00:00Z", valid_until: out.validUntil };
    expect(validateMandate(mandate).ok).toBe(true);
    expect(out.labels.map((l) => l.en)).toEqual(["HK$800 budget", "Until 31 Oct", "Clothes and shoes only", "Verified sellers only", "Max HK$300 per purchase", "At most 2 purchases a day"]);
    expect(out.labels.find((l) => l.kind === "category")?.zhHK).toBe("只限衣服及鞋");
  });
});

describe("deterministic post-checks: clamp, drop, never loosen", () => {
  it("clamps the budget to one card's ceiling [F1]", async () => {
    answer({ budget_hkd: 5_000 });
    const out = ok(await compile("HK$5000 this month for clothes"));
    expect(out.rules.budget.amount_minor).toBe(200_000);
    expect(out.clamped).toEqual([expect.objectContaining({ field: "budget.amount_minor", asked: "HK$5000", applied: "HK$2000" })]);
  });

  it.each([
    ["no amount", { budget_hkd: null }, "no_budget"],
    ["a zero amount", { budget_hkd: 0 }, "budget_below_minimum"],
    ["no known category", { categories: ["spaceships"] }, "no_category"],
    ["no category at all", { categories: [] }, "no_category"],
  ])("fails on %s so the caller falls back", async (_name, fields, reason) => {
    answer(fields);
    expect(await compile()).toMatchObject({ ok: false, reason });
  });

  it("drops unknown categories and says so", async () => {
    answer({ categories: ["apparel", "gift_card"] });
    const out = ok(await compile());
    expect(out.rules.categories).toEqual(["apparel"]);
    expect(out.clamped).toEqual([expect.objectContaining({ field: "categories", asked: "gift_card", applied: "dropped" })]);
  });

  it("never turns the seller check off: 'any seller' stays verified, with a clamp the shopper can see", async () => {
    answer({ sellers: "any" });
    const out = ok(await compile("HK$800 this month for clothes, any seller"));
    expect(out.rules.seller_check).toEqual({ require_capture: true });
    expect(out.clamped).toEqual([expect.objectContaining({ field: "seller_check.require_capture", asked: "any seller", applied: "verified sellers only" })]);
  });

  it("keeps a velocity limit only when it is at least as strict as F32", async () => {
    answer({ max_purchases: 2, per: "day" });
    expect(ok(await compile()).rules.velocity).toEqual({ max_mints: 2, window_s: 86_400 });
    answer({ max_purchases: 10, per: "day" });
    const loose = ok(await compile());
    expect(loose.rules.velocity).toBeUndefined();
    expect(loose.clamped).toEqual([expect.objectContaining({ field: "velocity", applied: "the default" })]);
  });

  it("clamps a long period and a cap above the budget, and drops an ask-above or share it cannot use", async () => {
    answer({ period: "weeks", period_count: 12, cap_hkd: 900, ask_above_hkd: 0, share_percent: 0 });
    const out = ok(await compile());
    expect(out.validUntil).toBe("2026-11-03T02:00:00Z"); // 31 days, not 84
    expect(out.rules.per_purchase).toEqual({ hard_cap_minor: 80_000 });
    expect(out.clamped.map((c) => c.field)).toEqual(["valid_until", "per_purchase.hard_cap_minor", "per_purchase.ask_above_minor", "per_purchase.share_of_remaining_bp"]);
  });

  it("notes the defaults it applied when the sentence is silent", async () => {
    answer({ period: "not_stated", sellers: "not_stated" });
    const out = ok(await compile("HK$800 for clothes"));
    expect(out.rules.seller_check.require_capture).toBe(true);
    expect(out.validUntil).toBe("2026-10-31T15:59:59Z");
    expect(out.notes.map((n) => n.en)).toEqual([
      "Sellers not mentioned: verified sellers only (the safe default).",
      "No end date in the sentence: the packet ends at the end of this month (HK time).",
    ]);
  });
});

describe("fails closed, never throws", () => {
  it.each([
    ["HTTP 500", { status: 500 }, "model_unavailable"],
    ["a timeout", { hang: true }, "model_unavailable"],
    ["prose instead of JSON", { answer: (): string => "Sure, HK$800 for clothes!" }, "invalid_answer"],
    ["a wrong field type", { answer: (): string => JSON.stringify({ budget_hkd: "800", categories: ["apparel"], period: "this_month", period_count: null, sellers: "verified_only" }) }, "invalid_answer"],
    ["an unknown period", { answer: (): string => JSON.stringify({ budget_hkd: 800, categories: ["apparel"], period: "forever", period_count: null, sellers: "verified_only" }) }, "invalid_answer"],
  ] as const)("on %s", async (_name, patch, reason) => {
    mock.set(patch);
    expect(await compile(M0, { timeoutMs: 300 })).toMatchObject({ ok: false, reason });
  });

  it("refuses an empty or too long sentence without a model call (cap measured after NFKC)", async () => {
    expect(await compile("   ")).toMatchObject({ ok: false, reason: "empty_sentence" });
    expect(await compile("Ｈ".repeat(281))).toMatchObject({ ok: false, reason: "sentence_too_long" });
    expect(mock.requests()).toHaveLength(0);
  });

  it("returns ok false when the client itself throws", async () => {
    const throwing: ChatClient = { complete: () => Promise.reject(new Error("boom")) };
    expect(await compile(M0, { client: throwing })).toMatchObject({ ok: false, reason: "model_unavailable" });
  });
});

describe("request", () => {
  it("sends the sentence as marked untrusted data with an enum of the known categories, the same bytes every time", async () => {
    answer({});
    await compile("呢個月買衫，預算八百蚊，只限驗證賣家");
    await compile("呢個月買衫，預算八百蚊，只限驗證賣家");
    const [a, b] = mock.requests();
    expect(a?.rawBody).toBe(b?.rawBody);
    // NFKC folds the full-width commas to ASCII before the cap is measured and the prompt is built.
    expect(userMessage(a)).toContain("<<<SENTENCE\n呢個月買衫,預算八百蚊,只限驗證賣家\nSENTENCE>>>");
    const schema = a?.body?.response_format.json_schema.schema as { properties: { categories: { items: { enum: string[] } } } };
    expect(schema.properties.categories.items.enum).toEqual(["apparel", "footwear", "electronics", "groceries"]);
    expect(a?.body?.temperature).toBe(0);
  });
});
