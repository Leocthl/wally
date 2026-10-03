import { afterEach, describe, expect, it } from "vitest";
import { FakeClock } from "@wally/core/testing";
import { createComponents, createLiveJudgeSource, describeComponents } from "../src/factory";
import { createRecordedSource } from "../src/judge/sources";
import { parseRecording } from "../src/judge/recording";
import { runHarness, type RunOutput } from "../src/run";
import { generateScenarios } from "../src/scenario/generate";
import { createSystems } from "../src/systems/create";
import type { RunOutcome } from "../src/systems/types";
import { createOracleClient, isTruncated, truthOf, type State } from "./support/oracle-client";
import { startMockLaya, type MockLaya } from "./support/mock-laya";
import { PINNED_META, testRun } from "./support/run-fixture";
import { RUN_MS, STEP_MS } from "./support/timeouts";

let server: MockLaya | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

/** Laya's wire format, answered by the oracle: one probability row per option rotation, for B0's state and the judge's. */
async function mockLaya(): Promise<MockLaya> {
  server = await startMockLaya((req) => {
    const truth = truthOf(req.state as State);
    const answers = Object.fromEntries(
      Object.entries(req.questions).map(([id, q]) => {
        const labels = Object.keys(q.criteria);
        const want = truth[id.split("__r")[0] as string] ?? labels[0];
        return [id, { type: "choice", choice: want, probabilities: Object.fromEntries(labels.map((l) => [l, l === want ? 0.9 : 0.1 / (labels.length - 1)])) }];
      }),
    );
    return { body: { model: "laya-rl-agent", answers, usage: { truncated: isTruncated(req.state as State), truncated_questions: [] } } };
  });
  return server;
}

// Provider differs on purpose (laya live, replay recorded) and latency is a property of the live call; the decisions must match.
const decisionsOnly = (o: RunOutcome) => ({ ...o, latencyMs: null, judge: o.judge === null ? null : { ...o.judge, latencyMs: 0, provider: "-" } });
const liveSource = (mock: MockLaya) => createLiveJudgeSource({ baseUrl: mock.url, revision: "55cf4c4e", record: true, provisional: "test recording" });
const baseRun = () => {
  let tick = 0;
  return { components: createComponents(), describe: describeComponents, timer: (): number => (tick += 6), meta: PINNED_META, clock: new FakeClock("2026-10-03T02:30:00Z") };
};

describe("determinism: same seed, same scenarios, same results with the recorded judge", () => {
  it("two recorded runs of one seed are identical down to the JSON", async () => {
    const a = await testRun({ seed: 7, n: 150 });
    const b = await testRun({ seed: 7, n: 150 });
    expect(JSON.stringify(b.result)).toBe(JSON.stringify(a.result));
    expect(b.summary).toBe(a.summary);
    expect(b.outcomes).toEqual(a.outcomes);
  }, RUN_MS);

  it("another seed gives other scenarios and other results", async () => {
    const a = await testRun({ seed: 7, n: 100 });
    const b = await testRun({ seed: 8, n: 100 });
    expect(b.scenarios).not.toEqual(a.scenarios);
    expect(JSON.stringify(b.result)).not.toBe(JSON.stringify(a.result));
  }, RUN_MS);

  it("a live run recorded against a server and replayed gives the same decisions, and the replay is repeatable", async () => {
    const mock = await mockLaya();
    const base = baseRun();
    const live: RunOutput = await runHarness({ ...base, seed: 11, n: 100, mode: "live", source: liveSource(mock) });
    expect(live.recording).not.toBeNull();
    expect(Object.keys(live.recording?.answers ?? {}).length).toBeGreaterThan(50);
    expect(Object.keys(live.recording?.judge ?? {}).length).toBeGreaterThan(50);
    const file = parseRecording(JSON.parse(JSON.stringify(live.recording)));

    const replayA = await runHarness({ ...base, seed: 11, n: 100, mode: "recorded", source: createRecordedSource(file) });
    const replayB = await runHarness({ ...base, seed: 11, n: 100, mode: "recorded", source: createRecordedSource(file) });
    expect(JSON.stringify(replayB.result)).toBe(JSON.stringify(replayA.result));
    expect((replayA.result["run"] as { judge: { replay: { misses: number } } }).judge.replay.misses).toBe(0);
    for (const b of ["B0", "B1", "B2"] as const) expect(replayA.outcomes[b].map(decisionsOnly)).toEqual(live.outcomes[b].map(decisionsOnly));
  }, RUN_MS);

  it("a recording says it is provisional when it was made while the judge wording was under tuning", async () => {
    const mock = await mockLaya();
    const live = await runHarness({ ...baseRun(), seed: 7, n: 40, mode: "live", source: liveSource(mock) });
    const replay = await runHarness({ ...baseRun(), seed: 7, n: 40, mode: "recorded", source: createRecordedSource(parseRecording(JSON.parse(JSON.stringify(live.recording)))) });
    const evidence = replay.result["evidence"] as { reasons: string[] };
    expect(evidence.reasons.join(" ")).toContain("provisional: test recording");
  }, RUN_MS);

  it("a recording that is missing inputs fails closed and says so", async () => {
    const mock = await mockLaya();
    const base = baseRun();
    const live = await runHarness({ ...base, seed: 7, n: 100, mode: "live", source: liveSource(mock) });
    const replay = await runHarness({ ...base, seed: 7, n: 120, mode: "recorded", source: createRecordedSource(parseRecording(JSON.parse(JSON.stringify(live.recording)))) });
    const run = replay.result["run"] as { judge: { replay: { misses: number } } };
    expect(run.judge.replay.misses).toBeGreaterThan(0);
    expect((replay.result["evidence"] as { reasons: string[] }).reasons.join(" ")).toContain("no recording");
    // An unrecorded input is an unusable judge, so the engine escalates and the shopper must say yes before anything mints.
    const unasked = replay.outcomes.B2.filter((o) => o.mints.length > 0 && o.judge?.status !== "OK" && o.escalations.every((e) => e.answer !== "APPROVE"));
    expect(unasked).toEqual([]);
  }, RUN_MS);
});

describe("no state leaks between scenarios or runs", () => {
  it("each scenario gives the same outcome in any order", async () => {
    const scenarios = generateScenarios({ seed: 7, n: 60 });
    let tick = 0;
    const timer = (): number => (tick += 1);
    const systems = createSystems({ components: createComponents(), judgeFor: () => { throw new Error("unused"); }, choiceFor: () => createOracleClient(), timer, measureLatency: false });
    const b0 = systems.find((s) => s.id === "B0")!;
    const forward = await Promise.all(scenarios.map((s) => b0.run(s)));
    const backward = [...(await Promise.all([...scenarios].reverse().map((s) => b0.run(s))))].reverse();
    expect(backward).toEqual(forward);
  }, RUN_MS);

  it("the scenario generator holds no state across calls", () => {
    const first = generateScenarios({ seed: 7, n: 150 });
    generateScenarios({ seed: 99, n: 150 });
    expect(generateScenarios({ seed: 7, n: 150 })).toEqual(first);
  }, STEP_MS);
});
