// One deterministic harness run for tests: the real engine, rail, merchant and executor behind factory.ts, a test double
// for the judge and the model (a keyword oracle), pinned metadata, a fake clock and a counting timer.
import { FakeClock } from "@laisee/core/testing";
import type { JudgePort } from "@laisee/core/ports";
import { createComponents, describeComponents } from "../../src/factory";
import type { ChoiceClient } from "../../src/judge/choice-client";
import { createClientSource, type JudgeSource } from "../../src/judge/sources";
import type { MetaReader } from "../../src/report/meta";
import type { Mode } from "../../src/report/result";
import { runHarness, type RunOutput } from "../../src/run";
import type { Components } from "../../src/systems/types";
import { keywordJudge } from "./keyword-model";
import { createOracleClient } from "./oracle-client";

export const PINNED_META: MetaReader = {
  read: () => ({ commit: "9be9705c9f7f9aa3e4d75b80fa3a91e182b27138", dirty: false, checkpointRevision: "55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851", device: "test device" }),
};

export interface TestRunOptions {
  readonly seed?: number;
  readonly n?: number;
  readonly mode?: Mode;
  readonly components?: Components;
  readonly judge?: JudgePort;
  readonly client?: ChoiceClient;
  readonly source?: JudgeSource;
}

export function testRun(opts: TestRunOptions = {}): Promise<RunOutput> {
  let tick = 0;
  const timer = (): number => (tick += 4);
  const mode = opts.mode ?? "recorded";
  return runHarness({
    seed: opts.seed ?? 7,
    n: opts.n ?? 150,
    mode,
    components: opts.components ?? createComponents(),
    describe: describeComponents,
    source: opts.source ?? createClientSource({ judge: opts.judge ?? keywordJudge(), client: opts.client ?? createOracleClient(), kind: mode === "live" ? "live" : "recorded" }),
    timer,
    meta: PINNED_META,
    clock: new FakeClock("2026-10-03T02:30:00Z"),
  });
}
