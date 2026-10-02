import { afterEach, describe, expect, it } from "vitest";
import { createLayaClient, rotationOrder } from "../src/judge/laya-client";
import { callKey, createRecorder, createReplayer, judgeKey, parseRecording, requestKey, RECORDING_SCHEMA, type Recording, type RecordingSource } from "../src/judge/recording";
import { BUDGET_FIT_QUESTION, JUDGE_QUESTIONS } from "../src/judge/questions";
import type { ChoiceClient, ChoiceRequest, ChoiceResult } from "../src/judge/choice-client";
import { generateScenarios } from "../src/scenario/generate";
import { judgeInputOf } from "../src/systems/b2";
import { biasedResponder, startMockLaya, type MockLaya, type Responder } from "./support/mock-laya";
import type { JudgePort, JudgeRecord } from "@laisee/core/ports";

let tick = 0;
const timer = (): number => (tick += 5);
let server: MockLaya | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function serve(responder: Responder): Promise<MockLaya> {
  server = await startMockLaya(responder);
  return server;
}

const REQUEST: ChoiceRequest = { state: { mandate: "HK$800, clothes, verified sellers.", listing: { title: "Tee", description: "Soft cotton." } }, questions: [BUDGET_FIT_QUESTION, ...JUDGE_QUESTIONS] };
const OPTS = { timeoutMs: 1_500 };
const flat = biasedResponder((labels) => labels.map(() => 1 / labels.length));
// Puts 60% on whichever option is shown first, the rest spread over the others: a position-biased model.
const firstBiased = biasedResponder((labels) => labels.map((_, i) => (i === 0 ? 0.6 : 0.4 / (labels.length - 1))));

describe("Laya wire client", () => {
  it("sends model typed-decisions with one rotation per option order and folds them back", async () => {
    const mock = await serve(flat);
    const client = createLayaClient({ baseUrl: mock.url, timer });
    const result = await client.ask(REQUEST, OPTS);
    expect(result.ok).toBe(true);
    const sent = mock.requests()[0];
    expect(sent?.model).toBe("typed-decisions");
    expect(Object.keys(sent?.questions ?? {})).toHaveLength(2 + 2 + 3 + 2 + 2); // one row per option rotation
    expect(sent?.questions["injection_risk__r1"]?.option_order).toEqual(rotationOrder(3, 1));
    if (result.ok) {
      expect(Object.keys(result.answers).sort()).toEqual(["budget_fit", "escalate_or_proceed", "injection_risk", "scope_fit", "seller_risk"]);
      expect(result.truncated).toBe(false);
    }
  });

  it("uses semantic labels, never yes/no (Laya README warning)", async () => {
    const mock = await serve(flat);
    await createLayaClient({ baseUrl: mock.url, timer }).ask(REQUEST, OPTS);
    const labels = Object.values(mock.requests()[0]?.questions ?? {}).flatMap((q) => Object.keys(q.criteria));
    expect(labels.some((l) => ["yes", "no", "true", "false"].includes(l))).toBe(false);
  });

  it("rotation averaging makes a position-biased model order-independent", async () => {
    const mock = await serve(firstBiased);
    const client = createLayaClient({ baseUrl: mock.url, timer });
    const result = await client.ask(REQUEST, OPTS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const q of REQUEST.questions) {
      const p = Object.values(result.answers[q.id]?.probabilities ?? {});
      expect(Math.max(...p) - Math.min(...p), q.id).toBeLessThan(1e-9); // every option got the same mean share
    }
  });

  it("without rotations it sends one row per question and no option_order", async () => {
    const mock = await serve(flat);
    await createLayaClient({ baseUrl: mock.url, timer, rotations: false }).ask(REQUEST, OPTS);
    const q = mock.requests()[0]?.questions ?? {};
    expect(Object.keys(q)).toHaveLength(REQUEST.questions.length);
    expect(Object.values(q).every((x) => x.option_order === undefined)).toBe(true);
  });

  it("reports usage.truncated instead of hiding it", async () => {
    const mock = await serve(biasedResponder((l) => l.map(() => 1 / l.length), true));
    const result = await createLayaClient({ baseUrl: mock.url, timer }).ask(REQUEST, OPTS);
    expect(result.ok && result.truncated).toBe(true);
  });

  const failures: readonly [string, Parameters<typeof serve>[0]][] = [
    ["HTTP 500", () => ({ status: 500, body: { detail: "inference failed" } })],
    ["malformed JSON", () => ({ rawBody: "{not json" })],
    ["no answers object", () => ({ body: { usage: { truncated: false } } })],
    ["missing usage.truncated", (req, seen) => ({ body: { ...(flat(req, seen).body as object), usage: {} } })],
    ["probabilities that do not sum to 1", (req) => ({ body: { answers: Object.fromEntries(Object.entries(req.questions).map(([id, q]) => [id, { choice: Object.keys(q.criteria)[0], probabilities: Object.fromEntries(Object.keys(q.criteria).map((l) => [l, 0.9])) }])), usage: { truncated: false } } })],
    ["an unknown option label", (req) => ({ body: { answers: Object.fromEntries(Object.entries(req.questions).map(([id]) => [id, { choice: "maybe", probabilities: { maybe: 1 } }])), usage: { truncated: false } } })],
  ];
  it.each(failures)("fails closed on %s", async (_name, responder) => {
    const mock = await serve(responder);
    const result = await createLayaClient({ baseUrl: mock.url, timer }).ask(REQUEST, OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("ERROR");
  });

  it("times out as TIMEOUT, not as an error or a hang", async () => {
    const mock = await serve((req, seen) => ({ ...flat(req, seen), delayMs: 300 }));
    const result = await createLayaClient({ baseUrl: mock.url, timer }).ask(REQUEST, { timeoutMs: 50 });
    expect(result).toMatchObject({ ok: false, status: "TIMEOUT" });
  });

  it("returns ERROR when nothing listens, without throwing", async () => {
    const mock = await serve(flat);
    const url = mock.url;
    await mock.close();
    server = null;
    expect(await createLayaClient({ baseUrl: url, timer }).ask(REQUEST, OPTS)).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("refuses an address that is not loopback: listing text stays on this Mac", () => {
    expect(() => createLayaClient({ baseUrl: "https://api.example.com", timer })).toThrow(/loopback/);
    expect(() => createLayaClient({ baseUrl: "http://10.0.0.5:8808", timer })).toThrow(/loopback/);
    expect(() => createLayaClient({ baseUrl: "http://127.0.0.1:8808", timer })).not.toThrow();
    expect(() => createLayaClient({ baseUrl: "http://localhost:8808", timer })).not.toThrow();
  });
});

describe("recording and replay of B0's model calls", () => {
  const source: RecordingSource = { model: "typed-decisions", revision: "55cf4c4e", device: "test", recordedAt: "2026-10-03T02:00:00Z", commit: "abc1234", seed: 7, n: 1 };
  const emptyRecording: Recording = { schema: RECORDING_SCHEMA, provenance: "RECORDED", source, answers: {}, failures: {}, judge: {} };

  it("replays exactly what a live client answered, keyed by what the model was shown", async () => {
    const mock = await serve(firstBiased);
    const recorder = createRecorder();
    const live = await recorder.client(createLayaClient({ baseUrl: mock.url, timer })).ask(REQUEST, OPTS);
    const replayer = createReplayer(parseRecording(JSON.parse(JSON.stringify(recorder.snapshot(source)))));
    const again = await replayer.client().ask(REQUEST, OPTS);
    expect(again.ok).toBe(true);
    if (live.ok && again.ok) {
      expect(again.answers).toEqual(live.answers);
      expect(again.truncated).toBe(live.truncated);
    }
    expect(replayer.stats()).toEqual({ hits: 1, recordedFailures: 0, misses: 0 });
  });

  it("an input it never saw is ERROR (fail closed) and is counted", async () => {
    const replayer = createReplayer(emptyRecording);
    const result = await replayer.client().ask(REQUEST, OPTS);
    expect(result).toMatchObject({ ok: false, status: "ERROR" });
    expect(replayer.stats()).toEqual({ hits: 0, recordedFailures: 0, misses: 1 });
  });

  it("replays a recorded failure as the same failure", async () => {
    const recorder = createRecorder();
    await recorder.client({ kind: "live", ask: async () => ({ ok: false, status: "TIMEOUT", reason: "slow", latencyMs: 1_500 }) }).ask(REQUEST, OPTS);
    const replayer = createReplayer(recorder.snapshot(source));
    expect(await replayer.client().ask(REQUEST, OPTS)).toMatchObject({ ok: false, status: "TIMEOUT" });
    // A recorded failure is a recording, not a gap: it is counted apart from inputs the recording never saw.
    expect(replayer.stats()).toEqual({ hits: 0, recordedFailures: 1, misses: 0 });
  });

  it("identical requests that got different answers live replay in the same order, so a replay reproduces the run", async () => {
    let call = 0;
    const flaky: ChoiceClient = {
      kind: "live",
      ask: async (): Promise<ChoiceResult> => {
        call += 1;
        return call === 2 ? { ok: false, status: "TIMEOUT", reason: "slow", latencyMs: 1_500 } : { ok: true, answers: { q: { choice: "a", probabilities: { a: call / 10, b: 1 - call / 10 } } }, truncated: false, latencyMs: call, meta: { model: "m", revision: null } };
      },
    };
    const recorder = createRecorder();
    const recording = recorder.client(flaky);
    const live = [await recording.ask(REQUEST, OPTS), await recording.ask(REQUEST, OPTS), await recording.ask(REQUEST, OPTS)];
    const replayer = createReplayer(parseRecording(JSON.parse(JSON.stringify(recorder.snapshot(source)))));
    const replay = replayer.client();
    const again = [await replay.ask(REQUEST, OPTS), await replay.ask(REQUEST, OPTS), await replay.ask(REQUEST, OPTS)];
    expect(again.map((r) => (r.ok ? "ok" : r.status))).toEqual(live.map((r) => (r.ok ? "ok" : r.status)));
    const [firstAgain, firstLive] = [again[0], live[0]];
    if (!firstAgain?.ok || !firstLive?.ok) throw new Error("the first call succeeded live, so it must replay as a success");
    expect(firstAgain.answers).toEqual(firstLive.answers);
    expect(replayer.stats()).toEqual({ hits: 2, recordedFailures: 1, misses: 0 });
    // a fourth identical request was never made live: it is a gap, not a copy of the third
    expect(await replay.ask(REQUEST, OPTS)).toMatchObject({ ok: false, reason: "no recording for this input" });
    expect(replayer.stats().misses).toBe(1);
  });

  it("the key depends on the state and the questions, not on object key order", () => {
    const a = requestKey({ state: { a: 1, b: 2 }, questions: REQUEST.questions });
    expect(requestKey({ state: { b: 2, a: 1 }, questions: REQUEST.questions })).toBe(a);
    expect(requestKey({ state: { a: 1, b: 3 }, questions: REQUEST.questions })).not.toBe(a);
  });

  it("rejects a file that is not a recording", () => {
    expect(() => parseRecording({ schema: "other" })).toThrow();
    expect(() => parseRecording(null)).toThrow();
    expect(() => parseRecording({ ...emptyRecording, answers: { nothex: {} } })).toThrow(/malformed/);
    const hash = "0".repeat(64);
    expect(() => parseRecording({ ...emptyRecording, answers: { [hash]: { answers: {}, truncated: false, latencyMs: 1 } } })).toThrow(/malformed/); // no call number
    expect(() => parseRecording({ ...emptyRecording, judge: { [callKey(hash, 0)]: { status: 7 } } })).toThrow(/malformed/);
    expect(() => parseRecording({ schema: "laisee.harness.recording/v1", provenance: "RECORDED", source, answers: {}, failures: {} })).toThrow(/schema/);
  });
});

describe("recording and replay of the judge's calls (B2)", () => {
  const source: RecordingSource = { model: "typed-decisions", revision: "55cf4c4e", device: "test", recordedAt: "2026-10-03T02:00:00Z", commit: "abc1234", seed: 7, n: 1 };
  const input = judgeInputOf(generateScenarios({ seed: 7, n: 1 })[0]!);
  const ok = (latency: number): JudgeRecord => ({
    provider: "laya",
    model: "typed-decisions",
    version: "test",
    status: "OK",
    latency_ms: latency,
    shadow: false,
    answers: { scope_fit: { in_scope: 0.9, out_of_scope: 0.1 }, injection_risk: { clean: 0.9, suspicious: 0.05, injection: 0.05 }, seller_risk: { low_risk: 0.9, high_risk: 0.1 }, escalate_or_proceed: { proceed: 0.9, escalate: 0.1 } },
  });
  const failing = (): JudgeRecord => ({ provider: "laya", model: "typed-decisions", version: "test", status: "TIMEOUT", latency_ms: 1_500, shadow: false });
  const scripted = (records: readonly JudgeRecord[]): JudgePort => {
    let call = 0;
    return { provider: "laya", assess: async () => records[Math.min(call++, records.length - 1)] as JudgeRecord };
  };

  it("replays the record the adapter returned, as provider replay, and counts it as a hit", async () => {
    const recorder = createRecorder();
    const live = await recorder.judge(scripted([ok(412)])).assess(input, OPTS);
    const replayer = createReplayer(parseRecording(JSON.parse(JSON.stringify(recorder.snapshot(source)))));
    const again = await replayer.judge().assess(input, OPTS);
    expect(again).toEqual({ ...live, provider: "replay" });
    expect(replayer.stats()).toEqual({ hits: 1, recordedFailures: 0, misses: 0 });
  });

  it("replays a recorded TIMEOUT as a TIMEOUT, apart from a gap", async () => {
    const recorder = createRecorder();
    await recorder.judge(scripted([failing()])).assess(input, OPTS);
    const replayer = createReplayer(recorder.snapshot(source));
    expect((await replayer.judge().assess(input, OPTS)).status).toBe("TIMEOUT");
    expect(replayer.stats()).toEqual({ hits: 0, recordedFailures: 1, misses: 0 });
  });

  it("a judge input the recording never saw is ERROR and counted as a miss (fail closed)", async () => {
    const replayer = createReplayer(createRecorder().snapshot(source));
    expect((await replayer.judge().assess(input, OPTS)).status).toBe("ERROR");
    expect(replayer.stats().misses).toBe(1);
  });

  it("identical judge inputs replay in the order they were made, including a failure in the middle", async () => {
    const recorder = createRecorder();
    const judge = recorder.judge(scripted([ok(10), failing(), ok(30)]));
    const live = [await judge.assess(input, OPTS), await judge.assess(input, OPTS), await judge.assess(input, OPTS)];
    const replay = createReplayer(recorder.snapshot(source)).judge();
    const again = [await replay.assess(input, OPTS), await replay.assess(input, OPTS), await replay.assess(input, OPTS)];
    expect(again.map((r) => r.status)).toEqual(live.map((r) => r.status));
    expect(again.map((r) => r.latency_ms)).toEqual(live.map((r) => r.latency_ms));
  });

  it("the key follows the judge's input, not the order of its fields", () => {
    expect(judgeKey({ ...input })).toBe(judgeKey(JSON.parse(JSON.stringify(input))));
    expect(judgeKey({ ...input, listingText: `${input.listingText} x` })).not.toBe(judgeKey(input));
  });

  it("a replayed record is a copy: changing it does not change the next replay", async () => {
    const recorder = createRecorder();
    await recorder.judge(scripted([ok(10)])).assess(input, OPTS);
    const recording = recorder.snapshot(source);
    const first = await createReplayer(recording).judge().assess(input, OPTS);
    (first.answers as { scope_fit: Record<string, number> }).scope_fit["in_scope"] = 0;
    const second = await createReplayer(recording).judge().assess(input, OPTS);
    expect(second.answers?.scope_fit.in_scope).toBeCloseTo(0.9, 9);
  });
});
