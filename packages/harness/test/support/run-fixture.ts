// One deterministic harness run for tests: injected engine, oracle model, pinned metadata, fake clock, counting timer.
import { FakeClock } from "@laisee/core/testing";
import type { Engine } from "@laisee/core/ports";
import { createComponents, describeComponents } from "../../src/factory";
import { createClientSource, type JudgeSource } from "../../src/judge/sources";
import type { MetaReader } from "../../src/report/meta";
import type { Mode } from "../../src/report/result";
import { runHarness, type RunOutput } from "../../src/run";
import type { ChoiceClient } from "../../src/judge/choice-client";
import { createOracleClient } from "./oracle-client";
import { engineUnderTest } from "./engine-under-test";

export const PINNED_META: MetaReader = {
  read: () => ({ commit: "9be9705c9f7f9aa3e4d75b80fa3a91e182b27138", dirty: false, checkpointRevision: "55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851", device: "test device" }),
};

export interface TestRunOptions {
  readonly seed?: number;
  readonly n?: number;
  readonly mode?: Mode;
  readonly engine?: Engine;
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
    components: createComponents({ engine: opts.engine ?? engineUnderTest().engine }),
    describe: describeComponents,
    source: opts.source ?? createClientSource(opts.client ?? createOracleClient(), mode === "live" ? "live" : "recorded", timer),
    timer,
    meta: PINNED_META,
    clock: new FakeClock("2026-10-03T02:30:00Z"),
  });
}
