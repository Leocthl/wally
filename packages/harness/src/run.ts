// Runs the harness: generate, warm up, run B0, B1 and B2 on every scenario, build the result. All dependencies are injected;
// factory.ts chooses the real or stand-in implementations and cli.ts chooses the clock, the files and the judge source.
import type { Clock } from "@wally/core/ports";
import type { ComponentReport } from "./factory";
import type { JudgeSource } from "./judge/sources";
import type { Recording, RecordingSource } from "./judge/recording";
import type { MetaReader, RunMeta } from "./report/meta";
import { buildResult, computeReport, type Computed, type Mode, type ResultInput } from "./report/result";
import { evaluateCorpus } from "./judge/corpus-eval";
import { renderSummary } from "./report/markdown";
import { generateScenarios } from "./scenario/generate";
import { createSystems } from "./systems/create";
import type { Components, RunOutcome, SystemUnderTest } from "./systems/types";
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

async function collect(scenarios: readonly Scenario[], systems: readonly SystemUnderTest[], onProgress: RunInput["onProgress"]): Promise<Record<Baseline, RunOutcome[]>> {
  const collected: Record<Baseline, RunOutcome[]> = { B0: [], B1: [], B2: [] };
  for (const [i, scenario] of scenarios.entries()) {
    for (const system of systems) collected[system.id].push(await system.run(scenario));
    onProgress?.(i + 1, scenarios.length);
  }
  return collected;
}

export async function runHarness(input: RunInput): Promise<RunOutput> {
  const scenarios = generateScenarios({ seed: input.seed, n: input.n });
  const base = scenarios[0];
  if (base === undefined) throw new RangeError("a run needs at least one scenario");
  await input.source.warmUp();
  const systems = createSystems({
    components: input.components,
    judgeFor: input.source.judgeFor,
    choiceFor: input.source.choiceFor,
    timer: input.timer,
    measureLatency: input.source.measureLatency,
  });
  const outcomes = await collect(scenarios, systems, input.onProgress);
  const corpus = await evaluateCorpus(input.source, base);
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
    hostLoad1m: meta.hostLoad1m,
  };
  const sourceOutcome = input.source.finish(recordingSource);
  const resultInput: ResultInput = {
    mode: input.mode,
    seed: input.seed,
    meta,
    runAt,
    source: input.source.info,
    sourceOutcome,
    components: input.describe(input.components.engine.version),
    scenarios,
    outcomes,
    systemDescriptions: Object.fromEntries(systems.map((s) => [s.id, s.description])) as Record<Baseline, string>,
    warmedUp: input.source.info.kind === "live",
    corpus,
  };
  const computed = computeReport(resultInput);
  return { scenarios, outcomes, computed, result: buildResult(resultInput, computed), summary: renderSummary(resultInput, computed), recording: sourceOutcome.recording };
}

export { BASELINES };
