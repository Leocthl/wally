// Picks the engine the harness tests run against: lane A's engine as soon as it is no longer the always-DENY stub,
// otherwise the reference double. Tests that depend on a working engine read `kind` and say which one ran.
import { engine as coreEngine } from "@laisee/core/engine";
import type { Engine, JudgeRecord } from "@laisee/core/ports";
import { CLEAN_ANSWERS } from "@laisee/core/testing";
import { generateScenarios } from "../../src/scenario/generate";
import { referenceEngine } from "./reference-engine";

export interface EngineUnderTest {
  readonly engine: Engine;
  readonly kind: "core" | "reference-double";
}

const PROBE_JUDGE: JudgeRecord = { provider: "replay", model: "probe", version: "probe", status: "OK", latency_ms: 0, shadow: false, answers: CLEAN_ANSWERS };

/** The stub denies even a plain, clean, in-budget cart (R1). A real engine approves it. */
function coreIsStub(): boolean {
  const probe = generateScenarios({ seed: 1, n: 1 })[0];
  if (!probe || !probe.label.legitimate) return true;
  const decision = coreEngine.decide(probe.mandate, probe.packet, probe.cart, PROBE_JUDGE, new Date(probe.now), undefined, { mandateProofValid: true });
  return decision.outcome !== "APPROVE" || /stub/i.test(decision.engine.version);
}

export function engineUnderTest(): EngineUnderTest {
  return coreIsStub() ? { engine: referenceEngine, kind: "reference-double" } : { engine: coreEngine, kind: "core" };
}
