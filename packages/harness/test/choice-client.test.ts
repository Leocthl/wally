import { afterEach, describe, expect, it } from "vitest";
import { createLayaClient, rotationOrder } from "../src/judge/laya-client";
import { createChoiceJudge } from "../src/judge/choice-judge";
import { createRecordedClient, createRecordingClient, parseRecording, requestKey, RECORDING_SCHEMA, type RecordingSource } from "../src/judge/recording";
import { createUnavailableClient } from "../src/judge/unavailable";
import { BUDGET_FIT_QUESTION, JUDGE_QUESTIONS } from "../src/judge/questions";
import type { ChoiceClient, ChoiceRequest } from "../src/judge/choice-client";
import { generateScenarios } from "../src/scenario/generate";
import { judgeInputOf } from "../src/systems/b2";
import { biasedResponder, startMockLaya, type MockLaya, type Responder } from "./support/mock-laya";
import { validateJudgeRecord } from "@laisee/core/schema";

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

describe("ChoiceJudge (JudgePort over a ChoiceClient)", () => {
  const scenario = generateScenarios({ seed: 7, n: 1 })[0]!;
  const input = judgeInputOf(scenario);
  const ask = { timeoutMs: 1_500 };

  it("maps four answers to a schema-valid OK record", async () => {
    const mock = await serve(flat);
    const judge = createChoiceJudge({ client: createLayaClient({ baseUrl: mock.url, timer }), timer, provider: "laya", version: "test" });
    const record = await judge.assess(input, ask);
    expect(record.status).toBe("OK");
    expect(validateJudgeRecord(record).ok).toBe(true);
    expect(record.answers?.injection_risk.clean).toBeCloseTo(1 / 3, 6);
  });

  it("turns usage.truncated into ERROR with input_truncated, never an OK record (padding attack, F26)", async () => {
    const mock = await serve(biasedResponder((l) => l.map(() => 1 / l.length), true));
    const judge = createChoiceJudge({ client: createLayaClient({ baseUrl: mock.url, timer }), timer, provider: "laya", version: "test" });
    const record = await judge.assess(input, ask);
    expect(record).toMatchObject({ status: "ERROR", input_truncated: true });
    expect(record.answers).toBeUndefined();
    expect(validateJudgeRecord(record).ok).toBe(true);
  });

  it("never throws, even if the client does", async () => {
    const broken: ChoiceClient = { kind: "fake", ask: async () => { throw new Error("boom"); } };
    const record = await createChoiceJudge({ client: broken, timer, provider: "laya", version: "test" }).assess(input, ask);
    expect(record.status).toBe("ERROR");
  });

  it("an unavailable client is an ERROR record, the judge_down path", async () => {
    const record = await createChoiceJudge({ client: createUnavailableClient(), timer, provider: "laya", version: "test" }).assess(input, ask);
    expect(record.status).toBe("ERROR");
  });
});

describe("recording and replay", () => {
  const source: RecordingSource = { model: "typed-decisions", revision: "55cf4c4e", device: "test", recordedAt: "2026-10-03T02:00:00Z", commit: "abc1234", seed: 7, n: 1 };

  it("replays exactly what a live client answered, keyed by what the model was shown", async () => {
    const mock = await serve(firstBiased);
    const recording = createRecordingClient(createLayaClient({ baseUrl: mock.url, timer }));
    const live = await recording.ask(REQUEST, OPTS);
    const replay = createRecordedClient(JSON.parse(JSON.stringify(recording.snapshot(source))));
    const again = await replay.ask(REQUEST, OPTS);
    expect(again.ok).toBe(true);
    if (live.ok && again.ok) {
      expect(again.answers).toEqual(live.answers);
      expect(again.truncated).toBe(live.truncated);
    }
    expect(replay.stats()).toEqual({ hits: 1, misses: 0 });
  });

  it("an input it never saw is ERROR (fail closed) and is counted", async () => {
    const replay = createRecordedClient({ schema: RECORDING_SCHEMA, provenance: "RECORDED", source, answers: {}, failures: {} });
    const result = await replay.ask(REQUEST, OPTS);
    expect(result).toMatchObject({ ok: false, status: "ERROR" });
    expect(replay.stats()).toEqual({ hits: 0, misses: 1 });
  });

  it("replays a recorded failure as the same failure", async () => {
    const recording = createRecordingClient({ kind: "live", ask: async () => ({ ok: false, status: "TIMEOUT", reason: "slow", latencyMs: 1_500 }) });
    await recording.ask(REQUEST, OPTS);
    const replay = createRecordedClient(recording.snapshot(source));
    expect(await replay.ask(REQUEST, OPTS)).toMatchObject({ ok: false, status: "TIMEOUT" });
  });

  it("the key depends on the state and the questions, not on object key order", () => {
    const a = requestKey({ state: { a: 1, b: 2 }, questions: REQUEST.questions });
    expect(requestKey({ state: { b: 2, a: 1 }, questions: REQUEST.questions })).toBe(a);
    expect(requestKey({ state: { a: 1, b: 3 }, questions: REQUEST.questions })).not.toBe(a);
  });

  it("rejects a file that is not a recording", () => {
    expect(() => parseRecording({ schema: "other" })).toThrow();
    expect(() => parseRecording(null)).toThrow();
    expect(() => parseRecording({ schema: RECORDING_SCHEMA, provenance: "RECORDED", source, answers: { nothex: {} }, failures: {} })).toThrow(/malformed/);
  });
});
