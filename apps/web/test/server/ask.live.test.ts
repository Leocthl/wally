// @vitest-environment node
// Live local model: Ask Wally against the running Qwen server (services/qwen, 127.0.0.1:8809) on the real stack. Skips
// itself when the server does not answer, so CI and a laptop without the model stay green and offline. The model is not
// asked to be right here (the exact item is not asserted, and a slow or undecided model is a valid INFO run): what must
// hold is a well-formed answer, a decision that matches the log, a card only on APPROVE, and a log that still verifies.
import type { Decision } from "@laisee/core/generated";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Booth } from "../../server/compose";
import type { CompileResult, RunSummary } from "../../src/api/types";
import { bootReal, orchestratorIsReal } from "./support/realStack";

const BASE = "http://127.0.0.1:8787";
const QWEN = process.env["PLANNER_BASE_URL"] ?? "http://127.0.0.1:8809";
const LIVE_TIMEOUT_MS = 180_000; // a shared, loaded machine; F33 is for an idle booth

async function qwenUp(): Promise<boolean> {
  try {
    return (await fetch(`${QWEN}/health`, { signal: AbortSignal.timeout(1_500) })).ok;
  } catch {
    return false;
  }
}

const RUN = (await orchestratorIsReal()) && (await qwenUp());
const OUTCOMES = ["APPROVE", "DENY", "ESCALATE", "INFO", "ERROR"];
let booth: Booth;

const post = (path: string, body: unknown) => booth.app.request(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function expectValidRun(res: Response): Promise<RunSummary> {
  expect(res.status, await res.clone().text()).toBe(200);
  const run = (await res.json()) as RunSummary;
  expect(typeof run.runId).toBe("string");
  expect(run.scenario).toBe("custom");
  expect(OUTCOMES).toContain(run.outcome);
  const entries = (await booth.backend.getLog()).entries;
  const decision: Decision | undefined = entries.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : [])).find((d) => d.id === run.decisionId);
  const cards = entries.filter((e) => e.kind === "CARD_MINTED");
  if (run.outcome === "APPROVE") {
    expect(decision?.outcome).toBe("APPROVE");
    expect(cards).toHaveLength(1);
  } else {
    expect(cards).toHaveLength(0); // a card exists only on APPROVE (I1)
    if (run.outcome === "INFO") expect(run.code).toMatch(/^NO_PROPOSAL:/);
  }
  expect((await booth.backend.verify()).result.ok).toBe(true);
  return run;
}

describe.skipIf(!RUN)("Ask Wally on the live local model (Qwen)", () => {
  beforeAll(async () => {
    booth = await bootReal({ PLANNER_PROVIDER: "local", PLANNER_BASE_URL: QWEN });
  }, LIVE_TIMEOUT_MS);
  afterAll(async () => booth?.close());

  it("an English ask produces a valid decision, or an honest 'asking you', and no crash", async () => {
    await booth.backend.reset();
    await expectValidRun(await post("/api/ask", { requestText: "I want a cotton tee", locale: "en" }));
  }, LIVE_TIMEOUT_MS);

  it("a Cantonese ask produces a valid decision, or an honest 'asking you', and no crash", async () => {
    await booth.backend.reset();
    await expectValidRun(await post("/api/ask", { requestText: "我想買件白色T恤，預算一百五十蚊", locale: "zh-HK" }));
  }, LIVE_TIMEOUT_MS);

  it("reads a sentence into rules: the model's suggestion or, when it fails, the fixed rules with a note", async () => {
    const res = await post("/api/compile", { text: "HK$800 this month for clothes, verified sellers only", locale: "en" });
    expect(res.status, await res.clone().text()).toBe(200);
    const result = (await res.json()) as CompileResult;
    expect(["model", "rules"]).toContain(result.source);
    expect(result.confirmRequired).toBe(true);
    expect(result.rules.budget.amount_minor).toBeGreaterThan(0);
    expect(result.labels.length).toBeGreaterThanOrEqual(4);
    if (result.source === "rules") expect(result.notes.length).toBeGreaterThan(0);
  }, LIVE_TIMEOUT_MS);
});
