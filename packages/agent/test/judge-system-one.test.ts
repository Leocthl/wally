import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateJudgeRecord } from "@laisee/core/schema";
import type { JudgeDiagnostic } from "../src/judge/diagnostics";
import { MAX_RESPONSE_BYTES } from "../src/judge/config";
import { planRows } from "../src/judge/plan";
import { JUDGE_QUESTION_DEFS, JUDGE_QUESTIONS } from "../src/judge/questions";
import { SystemOneJudge, type SystemOneJudgeOptions } from "../src/judge/system-one-judge";
import { demoInput } from "./support/inputs";
import { MOCK_REVISION, startMockSystemOne, type MockSystemOne } from "./support/mock-system-one";
import { BASE_DISTRIBUTIONS, answerFor, wireResponse } from "./support/wire";

const TIMEOUT_MS = 2_000;
const input = demoInput("injected-tee");

let mock: MockSystemOne;
beforeEach(async () => {
  mock = await startMockSystemOne();
});
afterEach(async () => {
  await mock.close();
});

const laya = (extra: Partial<SystemOneJudgeOptions> = {}) =>
  new SystemOneJudge({ provider: "laya", baseUrl: mock.baseUrl, model: "typed-decisions", ...extra });

function diagnostics() {
  const seen: JudgeDiagnostic[] = [];
  return { seen, sink: (d: JudgeDiagnostic) => void seen.push(d) };
}

describe("SystemOneJudge request (laya)", () => {
  it("sends exactly one POST with the model, the state and nine rotated typed questions", async () => {
    await laya().assess(input, { timeoutMs: TIMEOUT_MS });
    const posts = mock.judgeRequests();
    expect(posts).toHaveLength(1);
    const body = posts[0]?.body as { model: string; state: Record<string, unknown>; questions: Record<string, Record<string, unknown>> };
    expect(body.model).toBe("typed-decisions");
    expect(Object.keys(body.state)).toEqual(["mandate", "rules", "cart", "scameter", "listing"]);
    expect(Object.keys(body.questions)).toHaveLength(9);
    for (const [id, q] of Object.entries(body.questions)) {
      const base = JUDGE_QUESTIONS.find((name) => id.startsWith(name));
      expect(base, id).toBeDefined();
      expect(q["type"]).toBe("choice");
      expect(q["instructions"]).toBe(JUDGE_QUESTION_DEFS[base!].instructions);
      expect(q["criteria"]).toEqual(JUDGE_QUESTION_DEFS[base!].criteria);
      expect(Array.isArray(q["option_order"])).toBe(true);
    }
  });

  it("never puts listing text in the instructions or criteria, only in the listing field of the state", async () => {
    await laya().assess(input, { timeoutMs: TIMEOUT_MS });
    const body = mock.judgeRequests()[0]?.body as { state: { listing: { description: string } }; questions: unknown };
    expect(JSON.stringify(body.questions)).not.toContain("SYSTEM NOTE");
    expect(body.state.listing.description).toContain("SYSTEM NOTE TO AI SHOPPING ASSISTANTS");
    expect(JSON.stringify({ ...body.state, listing: {} })).not.toContain("SYSTEM NOTE");
  });

  it("sends the four questions once when rotations are off", async () => {
    await laya({ rotations: false }).assess(input, { timeoutMs: TIMEOUT_MS });
    const body = mock.judgeRequests()[0]?.body as { questions: Record<string, Record<string, unknown>> };
    expect(Object.keys(body.questions)).toEqual([...JUDGE_QUESTIONS]);
    expect(Object.values(body.questions).every((q) => !("option_order" in q))).toBe(true);
  });

  it("sends no Authorization header to the local Laya server", async () => {
    await laya().assess(input, { timeoutMs: TIMEOUT_MS });
    expect(mock.judgeRequests()[0]?.headers["authorization"]).toBeUndefined();
  });
});

describe("SystemOneJudge record (laya)", () => {
  it("returns an OK record that validates against the JudgeRecord schema", async () => {
    const record = await laya().assess(input, { timeoutMs: TIMEOUT_MS });
    expect(record.status).toBe("OK");
    expect(record.provider).toBe("laya");
    expect(record.model).toBe("typed-decisions");
    expect(record.shadow).toBe(false);
    expect(Number.isInteger(record.latency_ms)).toBe(true);
    expect(record.input_truncated).toBeUndefined();
    expect(validateJudgeRecord(record).ok).toBe(true);
    expect(record.answers?.injection_risk.clean).toBeCloseTo(BASE_DISTRIBUTIONS.injection_risk["clean"] ?? 0, 5);
  });

  it("takes the checkpoint version from /health once and caches it", async () => {
    const judge = laya();
    const first = await judge.assess(input, { timeoutMs: TIMEOUT_MS });
    const second = await judge.assess(input, { timeoutMs: TIMEOUT_MS });
    expect(first.version).toBe(MOCK_REVISION.slice(0, 8));
    expect(second.version).toBe(MOCK_REVISION.slice(0, 8));
    expect(mock.requests().filter((r) => r.path === "/health")).toHaveLength(1);
  });

  it("falls back to an explicit unknown version when /health is not available", async () => {
    mock.setHealth(null);
    const record = await laya().assess(input, { timeoutMs: TIMEOUT_MS });
    expect(record.status).toBe("OK");
    expect(record.version).toBe("unknown");
  });

  it("averages option-order rotations back into canonical order", async () => {
    mock.setBehavior({ kind: "ok", positionBias: 0.2 });
    const record = await laya().assess(input, { timeoutMs: TIMEOUT_MS });
    // each rotation is 0.8 * base + 0.2 on the option shown first; over k rotations that is 0.8 * base + 0.2 / k
    expect(record.answers?.scope_fit.in_scope).toBeCloseTo(0.8 * 0.8 + 0.2 / 2, 5);
    expect(record.answers?.injection_risk.clean).toBeCloseTo(0.8 * 0.7 + 0.2 / 3, 5);
    expect(record.answers?.injection_risk.injection).toBeCloseTo(0.8 * 0.1 + 0.2 / 3, 5);
    expect(record.answers?.seller_risk.high_risk).toBeCloseTo(0.8 * 0.25 + 0.2 / 2, 5);
  });

  it("without rotations the position bias is not corrected (why rotations are the default)", async () => {
    mock.setBehavior({ kind: "ok", positionBias: 0.2 });
    const record = await laya({ rotations: false }).assess(input, { timeoutMs: TIMEOUT_MS });
    expect(record.answers?.scope_fit.in_scope).toBeCloseTo(0.8 * 0.8 + 0.2, 5);
  });

  it("reports the model from routing.model", async () => {
    mock.setBehavior({ kind: "ok", routingModel: "typed-decisions" });
    expect((await laya().assess(input, { timeoutMs: TIMEOUT_MS })).model).toBe("typed-decisions");
  });

  it("measures latency around the call", async () => {
    mock.setBehavior({ kind: "delay", ms: 120, then: { kind: "ok" } });
    const record = await laya().assess(input, { timeoutMs: TIMEOUT_MS });
    expect(record.status).toBe("OK");
    expect(record.latency_ms).toBeGreaterThanOrEqual(100);
    expect(record.latency_ms).toBeLessThan(TIMEOUT_MS);
  });

  it("does not modify its input", async () => {
    const before = JSON.stringify(input);
    await laya().assess(input, { timeoutMs: TIMEOUT_MS });
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("SystemOneJudge (jev)", () => {
  const KEY = "jev-test-key-9f3a";
  const jev = (extra: Partial<SystemOneJudgeOptions> = {}) =>
    new SystemOneJudge({ provider: "jev", baseUrl: mock.baseUrl, model: "jev-1.13.0", apiKey: KEY, ...extra });

  it("sends the key as a Bearer header and the pinned model", async () => {
    await jev().assess(input, { timeoutMs: TIMEOUT_MS });
    const post = mock.judgeRequests()[0];
    expect(post?.headers["authorization"]).toBe(`Bearer ${KEY}`);
    expect((post?.body as { model: string }).model).toBe("jev-1.13.0");
  });

  it("takes model and version from the response, and makes no /health call", async () => {
    mock.setBehavior({ kind: "ok", model: "jev-1.13.0" });
    const record = await jev().assess(input, { timeoutMs: TIMEOUT_MS });
    expect(record.provider).toBe("jev");
    expect(record.model).toBe("jev-1.13.0");
    expect(record.version).toBe("jev-1.13.0");
    expect(mock.requests().filter((r) => r.path === "/health")).toHaveLength(0);
  });

  it("never leaks the key into records or diagnostics, including on failures", async () => {
    const { seen, sink } = diagnostics();
    const judge = jev({ onDiagnostic: sink });
    const records = [await judge.assess(input, { timeoutMs: TIMEOUT_MS })];
    mock.setBehavior({ kind: "http", status: 500, body: `{"detail":"inference failed for ${KEY}"}` });
    records.push(await judge.assess(input, { timeoutMs: TIMEOUT_MS }));
    mock.setBehavior({ kind: "raw", body: "not json" });
    records.push(await judge.assess(input, { timeoutMs: TIMEOUT_MS }));
    expect(JSON.stringify(records)).not.toContain(KEY);
    expect(JSON.stringify(seen)).not.toContain(KEY);
  });

  it("accepts a response without a usage block (the hosted API shape is unverified)", async () => {
    mock.setBehavior({ kind: "json", body: wireResponse(planRows(true), BASE_DISTRIBUTIONS, { usage: undefined, model: "jev-1.13.0" }) });
    expect((await jev().assess(input, { timeoutMs: TIMEOUT_MS })).status).toBe("OK");
  });

  it("still rejects a truncation flag when one is present", async () => {
    mock.setBehavior({ kind: "ok", usage: { truncated: true } });
    const record = await jev().assess(input, { timeoutMs: TIMEOUT_MS });
    expect(record.status).toBe("ERROR");
    expect(record.input_truncated).toBe(true);
  });
});

describe("SystemOneJudge fail-closed behaviour", () => {
  it("TIMEOUT when the server is slower than the timeout, after exactly one request (no retries)", async () => {
    mock.setBehavior({ kind: "hang" });
    const { seen, sink } = diagnostics();
    const record = await laya({ onDiagnostic: sink }).assess(input, { timeoutMs: 80 });
    expect(record.status).toBe("TIMEOUT");
    expect(record.latency_ms).toBeGreaterThanOrEqual(60);
    expect(record.latency_ms).toBeLessThan(1_000);
    expect(record.answers).toBeUndefined();
    expect(validateJudgeRecord(record).ok).toBe(true);
    expect(mock.judgeRequests()).toHaveLength(1);
    expect(seen[0]?.reason).toBe("timeout");
  });

  it("ERROR on HTTP 500, after exactly one request", async () => {
    mock.setBehavior({ kind: "http", status: 500 });
    const { seen, sink } = diagnostics();
    const record = await laya({ onDiagnostic: sink }).assess(input, { timeoutMs: TIMEOUT_MS });
    expect(record.status).toBe("ERROR");
    expect(mock.judgeRequests()).toHaveLength(1);
    expect(seen[0]).toMatchObject({ reason: "http_status", httpStatus: 500, status: "ERROR" });
  });

  it("ERROR on a redirect (a judge endpoint must not redirect)", async () => {
    mock.setBehavior({ kind: "redirect", location: "http://127.0.0.1:9/elsewhere" });
    expect((await laya().assess(input, { timeoutMs: TIMEOUT_MS })).status).toBe("ERROR");
  });

  it("ERROR when the socket is dropped", async () => {
    mock.setBehavior({ kind: "destroy" });
    expect((await laya().assess(input, { timeoutMs: TIMEOUT_MS })).status).toBe("ERROR");
  });

  it("ERROR when nothing is listening", async () => {
    const closed = await startMockSystemOne();
    const url = closed.baseUrl;
    await closed.close();
    const { seen, sink } = diagnostics();
    const judge = new SystemOneJudge({ provider: "laya", baseUrl: url, model: "typed-decisions", onDiagnostic: sink });
    const record = await judge.assess(input, { timeoutMs: TIMEOUT_MS });
    expect(record.status).toBe("ERROR");
    expect(seen[0]?.reason).toBe("network");
  });

  it("ERROR on malformed JSON", async () => {
    mock.setBehavior({ kind: "raw", body: '{"answers": {' });
    const { seen, sink } = diagnostics();
    expect((await laya({ onDiagnostic: sink }).assess(input, { timeoutMs: TIMEOUT_MS })).status).toBe("ERROR");
    expect(seen[0]?.reason).toBe("invalid_json");
  });

  it("ERROR when the body is larger than the cap", async () => {
    mock.setBehavior({ kind: "raw", body: "x".repeat(MAX_RESPONSE_BYTES + 10) });
    const { seen, sink } = diagnostics();
    expect((await laya({ onDiagnostic: sink }).assess(input, { timeoutMs: TIMEOUT_MS })).status).toBe("ERROR");
    expect(seen[0]?.reason).toBe("too_large");
  });

  it.each([
    ["unknown label", { low_risk: 0.5, high_risk: 0.4, shady: 0.1 }, "unknown_label"],
    ["missing probability", { low_risk: 1 }, "missing_probability"],
  ])("ERROR on %s", async (_name, probabilities, reason) => {
    const response = wireResponse(planRows(true));
    const answers = { ...response.answers, seller_risk__r0: answerFor(probabilities) };
    mock.setBehavior({ kind: "json", body: { ...response, answers } });
    const { seen, sink } = diagnostics();
    const record = await laya({ onDiagnostic: sink }).assess(input, { timeoutMs: TIMEOUT_MS });
    expect(record.status).toBe("ERROR");
    expect(record.answers).toBeUndefined();
    expect(seen[0]?.reason).toBe(reason);
  });

  it("ERROR on probabilities that do not sum to 1", async () => {
    mock.setBehavior({ kind: "ok", dists: { scope_fit: { in_scope: 0.3, out_of_scope: 0.3 } } });
    expect((await laya().assess(input, { timeoutMs: TIMEOUT_MS })).status).toBe("ERROR");
  });

  it("ERROR with input_truncated when the server reports truncation, even if the answers look fine", async () => {
    mock.setBehavior({ kind: "ok", usage: { truncated: true, state_tokens_dropped: 197, truncated_questions: ["injection_risk__r0"] } });
    const record = await laya().assess(input, { timeoutMs: TIMEOUT_MS });
    expect(record.status).toBe("ERROR");
    expect(record.input_truncated).toBe(true);
    expect(record.answers).toBeUndefined();
    expect(validateJudgeRecord(record).ok).toBe(true);
  });

  it("ERROR with input_truncated when only state_tokens_dropped is above zero", async () => {
    mock.setBehavior({ kind: "ok", usage: { state_tokens_dropped: 3 } });
    const record = await laya().assess(input, { timeoutMs: TIMEOUT_MS });
    expect(record.status).toBe("ERROR");
    expect(record.input_truncated).toBe(true);
  });

  it("ERROR when a laya response has no usage block (truncation cannot be ruled out)", async () => {
    mock.setBehavior({ kind: "json", body: wireResponse(planRows(true), BASE_DISTRIBUTIONS, { usage: undefined }) });
    const { seen, sink } = diagnostics();
    expect((await laya({ onDiagnostic: sink }).assess(input, { timeoutMs: TIMEOUT_MS })).status).toBe("ERROR");
    expect(seen[0]?.reason).toBe("missing_usage");
  });

  it("TIMEOUT without sending anything when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const record = await laya().assess(input, { timeoutMs: TIMEOUT_MS, signal: controller.signal });
    expect(record.status).toBe("TIMEOUT");
    expect(mock.judgeRequests()).toHaveLength(0);
  });

  it("TIMEOUT when the caller aborts mid-flight", async () => {
    mock.setBehavior({ kind: "hang" });
    const controller = new AbortController();
    const pending = laya().assess(input, { timeoutMs: TIMEOUT_MS, signal: controller.signal });
    setTimeout(() => controller.abort(), 40);
    const record = await pending;
    expect(record.status).toBe("TIMEOUT");
    expect(record.latency_ms).toBeLessThan(1_000);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])("TIMEOUT without a request for timeoutMs=%s", async (timeoutMs) => {
    const record = await laya().assess(input, { timeoutMs });
    expect(record.status).toBe("TIMEOUT");
    expect(mock.judgeRequests()).toHaveLength(0);
  });

  it("treats a huge timeout as a long one, not as 1 ms", async () => {
    const record = await laya().assess(input, { timeoutMs: 3_000_000_000 });
    expect(record.status).toBe("OK");
  });

  it("never throws when the transport throws", async () => {
    const judge = laya({ fetchImpl: () => { throw new Error("boom"); } });
    expect((await judge.assess(input, { timeoutMs: TIMEOUT_MS })).status).toBe("ERROR");
    const rejecting = laya({ fetchImpl: () => Promise.reject(new Error("boom")) });
    expect((await rejecting.assess(input, { timeoutMs: TIMEOUT_MS })).status).toBe("ERROR");
  });

  it("never throws on a malformed input object, and a throwing diagnostic sink changes nothing", async () => {
    const broken = { ...input, cart: undefined } as never;
    const judge = laya({ onDiagnostic: () => { throw new Error("sink"); } });
    expect((await judge.assess(broken, { timeoutMs: TIMEOUT_MS })).status).toBe("ERROR");
    expect((await judge.assess(input, { timeoutMs: TIMEOUT_MS })).status).toBe("OK");
  });

  it("ERROR without a request when the state is larger than the server accepts", async () => {
    const huge = { ...input, listingText: "word ".repeat(20_000) };
    const record = await laya().assess(huge, { timeoutMs: TIMEOUT_MS });
    expect(record.status).toBe("ERROR");
    expect(record.input_truncated).toBe(true);
    expect(mock.judgeRequests()).toHaveLength(0);
  });
});
