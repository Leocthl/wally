// Assembles B0, B1 and B2 from injected dependencies. One recorded planner output per scenario (Scenario.planner) feeds all three.
import type { Baseline } from "../types";
import { createB0Gate } from "./b0";
import { createB1Gate } from "./b1";
import { createB2Gate } from "./b2";
import { runPipeline, type Gate, type Policy } from "./pipeline";
import type { SystemDeps, SystemUnderTest } from "./types";

interface Spec {
  readonly policy: Policy;
  readonly description: string;
  readonly gate: (deps: SystemDeps) => Gate;
}

const SPECS: Readonly<Record<Baseline, Spec>> = {
  B0: {
    policy: { id: "B0", dedup: false, requote: false, voidOnRevoke: false },
    description: "model-only gate: Laya answers budget_fit and the judge questions and is trusted; no arithmetic, no rail limit",
    gate: (d) => createB0Gate(d),
  },
  B1: {
    policy: { id: "B1", dedup: true, requote: true, voidOnRevoke: true },
    description: "rules R1-R8 and R12 plus the rail limit, no judge (no R9, R10)",
    gate: (d) => createB1Gate(d),
  },
  B2: {
    policy: { id: "B2", dedup: true, requote: true, voidOnRevoke: true },
    description: "full pipeline: judge, engine R1-R12, rail limit, executor",
    gate: (d) => createB2Gate(d),
  },
};

export function createSystems(deps: SystemDeps): readonly SystemUnderTest[] {
  return (["B0", "B1", "B2"] as const).map((id) => {
    const spec = SPECS[id];
    const gate = spec.gate(deps);
    const pipelineDeps = { components: deps.components, timer: deps.timer, measureLatency: deps.measureLatency };
    return { id, description: spec.description, run: (scenario) => runPipeline(scenario, gate, spec.policy, pipelineDeps) };
  });
}
