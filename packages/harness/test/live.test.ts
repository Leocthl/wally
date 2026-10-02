// Live Laya on http://127.0.0.1:8808. Skips itself when /health is unreachable. Never starts, stops or changes the server.
import { describe, expect, it } from "vitest";
import { FakeClock } from "@laisee/core/testing";
import { validateJudgeRecord } from "@laisee/core/schema";
import { PADDING_CHARS, TIMEOUTS_MS } from "../src/config";
import { createChoiceJudge } from "../src/judge/choice-judge";
import { createLayaClient } from "../src/judge/laya-client";
import { JUDGE_QUESTIONS, BUDGET_FIT_QUESTION } from "../src/judge/questions";
import { createLiveSource, probeLaya } from "../src/judge/sources";
import { createUnavailableClient } from "../src/judge/unavailable";
import { createPrng } from "./support/prng-alias";
import { runHarness } from "../src/run";
import { createComponents, describeComponents } from "../src/factory";
import { monotonicTimer } from "../src/timer";
import { generateScenarios } from "../src/scenario/generate";
import { judgeInputOf } from "../src/systems/b2";
import { sizeChartFiller } from "../src/scenario/texts";
import { PINNED_META } from "./support/run-fixture";
import { engineUnderTest } from "./support/engine-under-test";

const BASE_URL = process.env["LAYA_BASE_URL"] ?? "http://127.0.0.1:8808";
const health = await probeLaya(BASE_URL);
const live = health !== null;

describe.skipIf(!live)(`live Laya at ${BASE_URL}`, () => {
  const client = () => createLayaClient({ baseUrl: BASE_URL, timer: monotonicTimer, revision: health?.revision ?? null });
  const scenario = generateScenarios({ seed: 7, n: 1 })[0]!;
  const input = judgeInputOf(scenario);
  const ask = { timeoutMs: TIMEOUTS_MS.judge * 20 }; // first call after a start is slow [F26]; this test is about shape, not speed

  it("answers all five questions in shape: probabilities over exactly the labels, summing to 1", async () => {
    const result = await client().ask({ state: { mandate: input.intentText, listing: { title: "Tee", description: scenario.listing.text, price: "HK$259", seller: "Demo", shipping: "free" } }, questions: [BUDGET_FIT_QUESTION, ...JUDGE_QUESTIONS] }, ask);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const q of [BUDGET_FIT_QUESTION, ...JUDGE_QUESTIONS]) {
      const p = result.answers[q.id]?.probabilities ?? {};
      expect(Object.keys(p).sort()).toEqual(q.options.map((o) => o.label).sort());
      expect(Object.values(p).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
    }
    expect(result.truncated).toBe(false);
  });

  it("produces a schema-valid OK judge record for a scenario", async () => {
    const record = await createChoiceJudge({ client: client(), timer: monotonicTimer, provider: "laya", version: "live-test" }).assess(input, ask);
    expect(record.status).toBe("OK");
    expect(validateJudgeRecord(record).ok).toBe(true);
  });

  it("the padding that the harness uses really overflows the context, and the long-but-fits text does not (F26)", async () => {
    const rng = createPrng(5);
    const base = "Cotton tee (SIMULATED). Soft cotton, regular fit. Free shipping.";
    const probe = async (text: string) => client().ask({ state: { mandate: input.intentText, listing: { title: "Tee", description: text, price: "HK$259", seller: "Demo", shipping: "free" } }, questions: JUDGE_QUESTIONS }, ask);
    const overflow = await probe(`${base} ${sizeChartFiller(rng, PADDING_CHARS.overflow)} Thank you.`);
    const fits = await probe(`${base} ${sizeChartFiller(rng, PADDING_CHARS.fits)}`);
    expect(overflow.ok && overflow.truncated).toBe(true);
    expect(fits.ok && fits.truncated).toBe(false);
  });

  it("padding past the context becomes an ERROR record with input_truncated, never an OK one", async () => {
    const padded = { ...input, listingText: `${input.listingText} ${sizeChartFiller(createPrng(6), PADDING_CHARS.overflow)} Thank you.` };
    const record = await createChoiceJudge({ client: client(), timer: monotonicTimer, provider: "laya", version: "live-test" }).assess(padded, ask);
    expect(record).toMatchObject({ status: "ERROR", input_truncated: true });
  });

  it("an unavailable client takes the same fail-closed path without touching the server", async () => {
    const record = await createChoiceJudge({ client: createUnavailableClient(), timer: monotonicTimer, provider: "laya", version: "live-test" }).assess(input, ask);
    expect(record.status).toBe("ERROR");
  });

  it("a short live harness run completes: MEASURED label, latency measured, warm-up excluded", async () => {
    const out = await runHarness({
      seed: 7,
      n: 18, // one pass over every slot
      mode: "live",
      components: createComponents({ engine: engineUnderTest().engine }),
      describe: describeComponents,
      source: createLiveSource({ baseUrl: BASE_URL, timer: monotonicTimer, revision: health?.revision ?? null, record: false }),
      timer: monotonicTimer,
      meta: PINNED_META,
      clock: new FakeClock("2026-10-03T02:30:00Z"),
    });
    expect(out.result["label"]).toMatch(/^MEASURED\(n=18, seed=7/);
    expect(out.computed.metrics.B2.latency?.n).toBeGreaterThan(0);
    expect((out.result["run"] as { judge: { warm_up_call_excluded: boolean } }).judge.warm_up_call_excluded).toBe(true);
  }, 180_000);
});

describe.skipIf(live)("live Laya is not reachable here", () => {
  it("skipped: the live tests need http://127.0.0.1:8808/health, and the harness never starts the server", () => {
    expect(live).toBe(false);
  });
});
