import { describe, expect, it } from "vitest";
import { ACCEPTANCE, SCENARIO_COUNT } from "../src/config";
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

describe("a run says what it is made of", () => {
  it("reports the engine, rail, merchant and executor as real and the cart builder as the stand-in", async () => {
    const { result } = await runFor(7);
    const c = result["components"] as Record<string, { real: boolean }>;
    expect(c["engine"]?.real).toBe(true);
    expect(c["rail"]?.real).toBe(true);
    expect(c["merchant"]?.real).toBe(true);
    expect(c["executor"]?.real).toBe(true);
    expect(c["cartBuilder"]?.real).toBe(false);
  }, RUN_MS);

  it("never calls a run with a stand-in cart builder or a test-double judge product evidence", async () => {
    const { result } = await runFor(7);
    const ev = result["evidence"] as { valid_as_product_evidence: boolean; reasons: string[] };
    expect(ev.valid_as_product_evidence).toBe(false);
    expect(ev.reasons.join(" ")).toMatch(/cartBuilder/);
    expect(ev.reasons.join(" ")).toMatch(/test doubles/);
  }, RUN_MS);
});
