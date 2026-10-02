// Assembles B0, B1 and B2 from injected dependencies. One recorded planner output per scenario (Scenario.planner) feeds all three.
import { createB0Gate } from "./b0";
import { createB1Gate } from "./b1";
import { createB2System } from "./b2";
import { runPipeline, type Gate, type Policy } from "./pipeline";
import type { SystemDeps, SystemUnderTest } from "./types";

interface Spec {
  readonly policy: Policy;
  readonly description: string;
  readonly gate: (deps: SystemDeps) => Gate;
}

// B0 and B1 are baselines without an orchestrator: they run through the harness's own small pipeline, which does what the
// orchestrator does for them (log the decision, mint, check out) and no more. B2 is the orchestrator itself.
const BASELINE_SPECS: Readonly<Record<"B0" | "B1", Spec>> = {
  B0: {
    policy: { id: "B0", world: "ungoverned", voidOnRevoke: false },
    description: "model-only gate: Laya answers budget_fit and the judge questions and is trusted; no arithmetic, no rail limit",
    gate: (d) => createB0Gate(d),
  },
  B1: {
    policy: { id: "B1", world: "governed", voidOnRevoke: true },
    description: "rules R1-R8 and R12 plus the rail limit, no judge (no R9, R10)",
    gate: (d) => createB1Gate(d),
  },
};

function baseline(id: "B0" | "B1", deps: SystemDeps): SystemUnderTest {
  const spec = BASELINE_SPECS[id];
  const gate = spec.gate(deps);
  const pipelineDeps = { components: deps.components, timer: deps.timer, measureLatency: deps.measureLatency, audit: deps.audit };
  return { id, description: spec.description, run: (scenario) => runPipeline(scenario, gate, spec.policy, pipelineDeps) };
}

export function createSystems(deps: SystemDeps): readonly SystemUnderTest[] {
  return [baseline("B0", deps), baseline("B1", deps), createB2System(deps)];
}
