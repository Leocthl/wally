// Two implementations of one specification: the real engine and a small reference written from docs/02 section 7 and the
// register (test/support/reference-engine.ts, test only, carrying its own copy of the register values). They must agree on
// the outcome, the primary reason and every failing rule for every generated scenario under many judge answers, including
// answers placed on either side of each threshold. A disagreement is a finding: either the engine, the reference or a
// config value is wrong, and the register decides which.
import { describe, expect, it } from "vitest";
import { engine } from "@laisee/core/engine";
import type { Decision, JudgeAnswers } from "@laisee/core/generated";
import type { JudgeRecord } from "@laisee/core/ports";
import { CLEAN_ANSWERS } from "@laisee/core/testing";
import { createRng, type Rng } from "../src/prng";
import { generateScenarios } from "../src/scenario/generate";
import type { Scenario } from "../src/types";
import { referenceDecide } from "./support/reference-engine";

const SEEDS = [7, 11, 42, 2026] as const;
const THRESHOLDS = [0.39, 0.86, 0.85, 0.63, 0.5] as const; // the register values the reference carries (F36 fitted, F50), used to aim the fuzz at the edges

const judgeOf = (answers: JudgeAnswers): JudgeRecord => ({ provider: "laya", model: "typed-decisions", version: "test", status: "OK", latency_ms: 5, shadow: false, answers });

/** A probability that is uniform half of the time and within 0.05 of a threshold the rest, so both sides of every edge are hit. */
function aimed(rng: Rng): number {
  if (rng.chance(1, 2)) return rng.next();
  const edge = rng.pick(THRESHOLDS);
  return Math.min(1, Math.max(0, edge + (rng.next() - 0.5) * 0.1));
}

function fuzzAnswers(rng: Rng): JudgeAnswers {
  const inScope = aimed(rng);
  const mass = aimed(rng);
  const split = rng.next();
  const risky = aimed(rng);
  const escalate = aimed(rng);
  return {
    scope_fit: { in_scope: inScope, out_of_scope: 1 - inScope },
    injection_risk: { clean: 1 - mass, suspicious: mass * split, injection: mass * (1 - split) },
    seller_risk: { low_risk: 1 - risky, high_risk: risky },
    escalate_or_proceed: { proceed: 1 - escalate, escalate },
  };
}

const FAILURES: readonly JudgeRecord[] = [
  { provider: "laya", model: "typed-decisions", version: "test", status: "TIMEOUT", latency_ms: 1_500, shadow: false },
  { provider: "laya", model: "typed-decisions", version: "test", status: "ERROR", latency_ms: 20, shadow: false },
  { provider: "laya", model: "typed-decisions", version: "test", status: "ERROR", latency_ms: 20, shadow: false, input_truncated: true },
];

interface Signature {
  readonly outcome: string;
  readonly primary: string | null;
  readonly fails: readonly string[];
  readonly limit: number | null;
}

function signature(d: Decision): Signature {
  return {
    outcome: d.outcome,
    primary: d.explanation?.template_id ?? null,
    fails: d.rules.filter((r) => r.result === "FAIL").map((r) => `${r.id}:${r.template_id}`).sort(),
    limit: d.approved_limit_minor ?? null,
  };
}

function bothDecide(s: Scenario, judge: JudgeRecord, proof: boolean): { real: Signature; reference: Signature } {
  const now = new Date(s.now);
  const ctx = { mandateProofValid: proof };
  return { real: signature(engine.decide(s.mandate, s.packet, s.cart, judge, now, undefined, ctx)), reference: signature(referenceDecide(s.mandate, s.packet, s.cart, judge, now, undefined, ctx)) };
}

function disagreements(scenarios: readonly Scenario[], judges: (s: Scenario, i: number) => readonly JudgeRecord[], proof = true): string[] {
  return scenarios.flatMap((s, i) =>
    judges(s, i).flatMap((judge, k) => {
      const { real, reference } = bothDecide(s, judge, proof);
      return JSON.stringify(real) === JSON.stringify(reference) ? [] : [`${s.id} ${s.variant} judge#${k}: engine ${JSON.stringify(real)} vs reference ${JSON.stringify(reference)}`];
    }),
  );
}

describe("the real engine and the reference agree on every generated scenario", () => {
  it.each(SEEDS)("clean judge answers, seed %i", (seed) => {
    const scenarios = generateScenarios({ seed, n: 150 });
    expect(disagreements(scenarios, () => [judgeOf(CLEAN_ANSWERS)])).toEqual([]);
  });

  it.each(SEEDS)("judge answers aimed at every threshold, 8 per scenario, seed %i", (seed) => {
    const scenarios = generateScenarios({ seed, n: 150 });
    const rng = createRng(seed + 1_000);
    expect(disagreements(scenarios, () => Array.from({ length: 8 }, () => judgeOf(fuzzAnswers(rng))))).toEqual([]);
  });

  it.each(SEEDS)("a judge that timed out, failed or truncated, seed %i", (seed) => {
    expect(disagreements(generateScenarios({ seed, n: 150 }), () => FAILURES)).toEqual([]);
  });

  it("an unverified credential proof stops everything, in both", () => {
    const scenarios = generateScenarios({ seed: 7, n: 150 });
    expect(disagreements(scenarios, () => [judgeOf(CLEAN_ANSWERS)], false)).toEqual([]);
    for (const s of scenarios.slice(0, 20)) expect(bothDecide(s, judgeOf(CLEAN_ANSWERS), false).real.primary).toBe("R1.invalid_signature");
  });
});

describe("the fuzz reaches every outcome and every judge rule, so agreement means something", () => {
  it("covers APPROVE, DENY and ESCALATE and the four judge templates", () => {
    const rng = createRng(99);
    const seen = new Set<string>();
    for (const s of generateScenarios({ seed: 7, n: 150 })) {
      for (let k = 0; k < 8; k += 1) {
        const d = engine.decide(s.mandate, s.packet, s.cart, judgeOf(fuzzAnswers(rng)), new Date(s.now), undefined, { mandateProofValid: true });
        seen.add(d.outcome);
        for (const r of d.rules) if (r.result === "FAIL" && r.template_id?.startsWith("R10.")) seen.add(r.template_id);
      }
    }
    for (const want of ["APPROVE", "DENY", "ESCALATE", "R10.injection", "R10.seller_risk", "R10.scope", "R10.escalate"]) expect(seen.has(want), want).toBe(true);
  });
});
