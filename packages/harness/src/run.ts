// Runs the harness: generate, warm up, run B0, B1 and B2 on every scenario, build the result. All dependencies are injected;
// factory.ts chooses the real or stand-in implementations and cli.ts chooses the clock, the files and the judge source.
import type { Clock } from "@laisee/core/ports";
import { NO_JUDGE } from "./systems/b1";
import type { ComponentReport } from "./factory";
import type { JudgeSource } from "./judge/sources";
import type { Recording, RecordingSource } from "./judge/recording";
import type { MetaReader, RunMeta } from "./report/meta";
import { buildResult, computeReport, type Computed, type Mode } from "./report/result";
import { renderSummary } from "./report/markdown";
import type { CartBuilder } from "./scenario/cart";
import { generateScenarios } from "./scenario/generate";
import { createSystems } from "./systems/create";
import type { Components, RunOutcome } from "./systems/types";
import type { Timer } from "./timer";
import { BASELINES, type Baseline, type Scenario } from "./types";

export interface RunInput {
  readonly seed: number;
  readonly n: number;
  readonly mode: Mode;
  readonly components: Components;
  readonly describe: (engineVersion: string) => ComponentReport;
  readonly source: JudgeSource;
  readonly timer: Timer;
  readonly meta: MetaReader;
  readonly clock: Clock;
  readonly buildCart?: CartBuilder;
  readonly onProgress?: (done: number, total: number) => void;
}

export interface RunOutput {
  readonly scenarios: readonly Scenario[];
  readonly outcomes: Readonly<Record<Baseline, readonly RunOutcome[]>>;
  readonly computed: Computed;
  readonly result: Record<string, unknown>;
  readonly summary: string;
  /** Set on a live run that recorded: the file to commit so the run can be replayed. */
  readonly recording: Recording | null;
}

/** Version string the engine stamps on a Decision, read from a probe so a swapped-in engine is detected, not declared. */
function probeEngineVersion(components: Components, scenario: Scenario | undefined): string {
  if (scenario === undefined) return "unknown";
  try {
    return components.engine.decide(scenario.mandate, scenario.packet, scenario.cart, NO_JUDGE, new Date(scenario.now), undefined, { mandateProofValid: true }).engine.version;
  } catch {
    return "engine threw on the probe";
  }
}

export async function runHarness(input: RunInput): Promise<RunOutput> {
  const scenarios = generateScenarios({ seed: input.seed, n: input.n, ...(input.buildCart === undefined ? {} : { buildCart: input.buildCart }) });
  await input.source.warmUp();
  const systems = createSystems({
    components: input.components,
    judgeFor: input.source.judgeFor,
    choiceFor: input.source.choiceFor,
    timer: input.timer,
    measureLatency: input.source.measureLatency,
  });
  const collected: Record<Baseline, RunOutcome[]> = { B0: [], B1: [], B2: [] };
  for (const [i, scenario] of scenarios.entries()) {
    for (const system of systems) collected[system.id].push(await system.run(scenario));
    input.onProgress?.(i + 1, scenarios.length);
  }
  const meta: RunMeta = input.meta.read();
  const runAt = input.clock.now();
  const recordingSource: RecordingSource = {
    model: input.source.info.model,
    revision: input.source.info.checkpointRevision,
    device: meta.device,
    recordedAt: runAt.toISOString().replace(".000Z", "Z"),
    commit: meta.commit,
    seed: input.seed,
    n: input.n,
  };
  const sourceOutcome = input.source.finish(recordingSource);
  const resultInput = {
    mode: input.mode,
    seed: input.seed,
    meta,
    runAt,
    source: input.source.info,
    sourceOutcome,
    components: input.describe(probeEngineVersion(input.components, scenarios[0])),
    scenarios,
    outcomes: collected,
    systemDescriptions: Object.fromEntries(systems.map((s) => [s.id, s.description])) as Record<Baseline, string>,
    warmedUp: input.source.info.kind === "live",
  };
  const computed = computeReport(resultInput);
  return {
    scenarios,
    outcomes: collected,
    computed,
    result: buildResult(resultInput, computed),
    summary: renderSummary(resultInput, computed),
    recording: sourceOutcome.recording,
  };
}

export { BASELINES };
