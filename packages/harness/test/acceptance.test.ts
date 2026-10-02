import { describe, expect, it } from "vitest";
import { engine as coreEngine } from "@laisee/core/engine";
import { ACCEPTANCE, SCENARIO_COUNT } from "../src/config";
import { engineUnderTest } from "./support/engine-under-test";
import { testRun } from "./support/run-fixture";

const SEEDS = [7, 11, 42, 2026] as const;
const { kind } = engineUnderTest();

describe(`acceptance targets [F38], engine under test: ${kind}`, () => {
  it.each(SEEDS)("T-H1: no over-limit mint or charge in the deterministic scenarios for B2, seed %i", async (seed) => {
    const { computed } = await testRun({ seed });
    const t = computed.acceptance.find((a) => a.id === "T-H1");
    expect(t?.result.n).toBeGreaterThan(0);
    expect(t?.result.k).toBeLessThanOrEqual(ACCEPTANCE.maxOverLimitMintsDeterministic);
    expect(t?.pass).toBe(true);
  });

  it.each(SEEDS)("T-H2: legitimate scenarios approved at or above the target, seed %i", async (seed) => {
    const { computed } = await testRun({ seed });
    const t = computed.acceptance.find((a) => a.id === "T-H2");
    if (!t) throw new Error("T-H2 missing");
    expect(t.result.n).toBeGreaterThan(0);
    expect(t.result.k * 100).toBeGreaterThanOrEqual(t.result.n * ACCEPTANCE.minLegitimateApprovedPct);
    expect(t.pass).toBe(true);
  });

  it("holds for B1 as well: the rules and the rail limit alone never mint above the limit (D-28)", async () => {
    for (const seed of SEEDS) {
      const { computed } = await testRun({ seed });
      expect(computed.metrics.B1.overLimitMint.k, `seed ${seed}`).toBe(0);
      expect(computed.metrics.B2.overLimitMint.k, `seed ${seed}`).toBe(0);
    }
  });

  it("makes no claim about B0 or B1 beyond what it measured: the structure is reported, the numbers are whatever they are", async () => {
    const { computed } = await testRun();
    for (const b of ["B0", "B1", "B2"] as const) {
      const m = computed.metrics[b];
      expect(m.scenarios).toBe(SCENARIO_COUNT.default);
      for (const r of [m.overspend, m.overLimitMint, m.wrongMerchant, m.falseBlock, m.stopBreach, m.injectionPassThrough, m.labelAgreement]) {
        expect(Number.isInteger(r.k) && Number.isInteger(r.n) && r.k >= 0 && r.k <= r.n).toBe(true);
      }
    }
  });
});

describe("a run on the engine that is on main today says what it is", () => {
  it("reports the stub as not real, and a missed target as a miss", async () => {
    const stubbed = engineUnderTest().kind === "reference-double";
    const { computed, result } = await testRun({ engine: coreEngine });
    const components = result["components"] as { engine: { real: boolean } };
    expect(components.engine.real).toBe(!stubbed);
    if (stubbed) {
      // The stub denies everything: nothing mints, so T-H1 holds vacuously and T-H2 is missed. Both are reported as they are.
      expect(computed.acceptance.find((a) => a.id === "T-H1")?.pass).toBe(true);
      expect(computed.acceptance.find((a) => a.id === "T-H2")?.pass).toBe(false);
      expect((result["evidence"] as { valid_as_product_evidence: boolean }).valid_as_product_evidence).toBe(false);
    }
  });

  it("never calls a run on fakes and stand-ins product evidence", async () => {
    const { result } = await testRun();
    const ev = result["evidence"] as { valid_as_product_evidence: boolean; reasons: string[] };
    expect(ev.valid_as_product_evidence).toBe(false);
    expect(ev.reasons.length).toBeGreaterThan(0);
  });
});
