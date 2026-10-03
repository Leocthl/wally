import { describe, expect, it } from "vitest";
import { ACCEPTANCE, SCENARIO_COUNT } from "../src/config";
import { BENIGN_IMPERATIVES, INJECTION_CORPUS } from "../src/scenario/injections";
import { FakeJudge } from "@wally/core/testing";
import type { RunOutput } from "../src/run";
import { testRun } from "./support/run-fixture";
import { RUN_MS } from "./support/timeouts";

// The judge here is a keyword oracle that answers as the labels assume, so these tests check the wiring and the labels
// against the real engine, rail and executor. They say nothing about how Laya does: that is what a live run measures.
const SEEDS = [7, 11, 42, 2026] as const;

const runs = new Map<number, Promise<RunOutput>>();
function runFor(seed: number): Promise<RunOutput> {
  const known = runs.get(seed);
  if (known !== undefined) return known;
  const started = testRun({ seed });
  runs.set(seed, started);
  return started;
}

describe("acceptance targets [F38] with the real engine, rail, merchant and executor", () => {
  it.each(SEEDS)("T-H1: no over-limit mint or charge in the deterministic scenarios for B2, seed %i", async (seed) => {
    const { computed } = await runFor(seed);
    const t = computed.acceptance.find((a) => a.id === "T-H1");
    expect(t?.result.n).toBeGreaterThan(0);
    expect(t?.result.k).toBeLessThanOrEqual(ACCEPTANCE.maxOverLimitMintsDeterministic);
    expect(t?.pass).toBe(true);
  }, RUN_MS);

  it.each(SEEDS)("T-H2: legitimate scenarios approved at or above the target, seed %i", async (seed) => {
    const { computed } = await runFor(seed);
    const t = computed.acceptance.find((a) => a.id === "T-H2");
    if (!t) throw new Error("T-H2 missing");
    expect(t.result.n).toBeGreaterThan(0);
    expect(t.result.k * 100).toBeGreaterThanOrEqual(t.result.n * ACCEPTANCE.minLegitimateApprovedPct);
    expect(t.pass).toBe(true);
  }, RUN_MS);

  it("holds for B1 as well: the rules and the rail limit alone never mint above the limit (D-28)", async () => {
    for (const seed of SEEDS) {
      const { computed } = await runFor(seed);
      expect(computed.metrics.B1.overLimitMint.k, `seed ${seed}`).toBe(0);
      expect(computed.metrics.B2.overLimitMint.k, `seed ${seed}`).toBe(0);
    }
  }, RUN_MS);

  it("makes no claim about B0 or B1 beyond what it measured: the structure is reported, the numbers are whatever they are", async () => {
    const { computed } = await runFor(7);
    for (const b of ["B0", "B1", "B2"] as const) {
      const m = computed.metrics[b];
      expect(m.scenarios).toBe(SCENARIO_COUNT.default);
      for (const r of [m.overspend, m.overLimitMint, m.wrongMerchant, m.falseBlock, m.stopBreach, m.injectionPassThrough, m.labelAgreement]) {
        expect(Number.isInteger(r.k) && Number.isInteger(r.n) && r.k >= 0 && r.k <= r.n).toBe(true);
      }
    }
  }, RUN_MS);

  it("every B2 log verifies offline and holds exactly one DECISION per distinct decision (I7)", async () => {
    const { outcomes } = await runFor(7);
    const bad = outcomes.B2.filter((o) => o.log === null || !o.log.chainOk || o.log.decisions < o.decision.decisionIds.length);
    expect(bad.map((o) => `${o.scenarioId}: ${JSON.stringify(o.log)}`)).toEqual([]);
  }, RUN_MS);
});

describe("T-H2 three ways, so a reader can see how much of a miss is the machine", () => {
  const timingOut = (input: { readonly cart: { readonly id: string } }) => (Number.parseInt(input.cart.id.replace(/\D/g, "").slice(-1) || "0", 10) % 3 === 0 ? { status: "TIMEOUT" as const } : {});
  const judge = new FakeJudge({ respond: timingOut });
  let run: Promise<RunOutput> | null = null;
  const timedOutRun = (): Promise<RunOutput> => (run ??= testRun({ seed: 7, judge }));
  const acceptance = (out: RunOutput, id: string) => out.computed.acceptance.find((a) => a.id === id);

  it("lists the legitimate scenarios whose judge call timed out, with their count and the host load, and never retries them", async () => {
    const out = await timedOutRun();
    const legitTimeouts = out.scenarios.filter((s, i) => s.label.legitimate && out.outcomes.B2[i]?.judge?.status === "TIMEOUT");
    expect(legitTimeouts.length).toBeGreaterThan(0);
    const detail = (out.result["acceptance_detail"] as { judge_timeout_cases: { count: number; scenarios: string[]; host_load_average_1m: number | null } }).judge_timeout_cases;
    expect(detail.scenarios).toEqual(legitTimeouts.map((s) => s.id));
    expect(detail.count).toBe(legitTimeouts.length);
    expect(out.summary).toContain(`**Judge-timeout cases**: ${legitTimeouts.length} of`);
    // One judge call per distinct cart (a repeat returns the earlier decision, so it calls nothing), one per corpus item,
    // none for an injected outage, none for an answer: nothing was retried.
    const carts = out.scenarios.filter((s) => s.events.judgeFault === "none").length;
    expect(judge.calls.length).toBe(carts + INJECTION_CORPUS.length + BENIGN_IMPERATIVES.length);
  }, RUN_MS);

  it("counts a timeout as a block as measured, as a question the shopper answered, and drops it from the third number", async () => {
    const out = await timedOutRun();
    const measured = acceptance(out, "T-H2")?.result;
    const afterAnswer = acceptance(out, "T-H2-after-answer")?.result;
    const without = acceptance(out, "T-H2-without-timeouts")?.result;
    if (!measured || !afterAnswer || !without) throw new Error("a T-H2 number is missing");
    const legit = out.scenarios.filter((s) => s.label.legitimate).length;
    const timeouts = (out.result["acceptance_detail"] as { judge_timeout_cases: { count: number } }).judge_timeout_cases.count;
    expect([measured.n, afterAnswer.n, without.n]).toEqual([legit, legit, legit - timeouts]);
    expect(measured.k).toBeLessThan(afterAnswer.k); // the shopper said yes to the escalations the timeouts caused
    expect(without.k).toBeLessThanOrEqual(measured.k);
    expect(acceptance(out, "T-H2")?.pass, "the pass flag follows the number as measured").toBe(measured.k * 100 >= measured.n * ACCEPTANCE.minLegitimateApprovedPct);
  }, RUN_MS);
});

describe("a run says what it is made of", () => {
  it("reports every component as real, the orchestrator and the real cart builder included", async () => {
    const { result } = await runFor(7);
    const c = result["components"] as Record<string, { real: boolean }>;
    for (const name of ["engine", "orchestrator", "planner", "cartBuilder", "rail", "merchant", "executor", "judge"]) expect(c[name]?.real, name).toBe(true);
  }, RUN_MS);

  it("never calls a run with a test-double judge product evidence, and states the rule it applies", async () => {
    const { result } = await runFor(7);
    const ev = result["evidence"] as { valid_as_product_evidence: boolean; reasons: string[]; rule: string };
    expect(ev.valid_as_product_evidence).toBe(false);
    expect(ev.reasons.join(" ")).toMatch(/test doubles/);
    expect(ev.reasons.join(" ")).not.toMatch(/not the real implementation/);
    expect(ev.rule).toMatch(/every component is the real implementation/);
  }, RUN_MS);
});
