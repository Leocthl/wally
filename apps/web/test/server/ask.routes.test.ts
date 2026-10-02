// @vitest-environment node
// POST /api/ask, /api/alternatives and /api/compile on the routes alone (Hono app.request, no sockets): the same guards as
// every other POST (loopback Host and Origin, JSON content type, body cap), the typed-request cap [F56] after NFKC, strict
// bodies, and the JSON error shape. The backend is a recording stub here; the real stack is in ask.real.test.ts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpApp, MAX_BODY_BYTES, NOT_COMPOSED_BACKEND } from "../../server/app";
import type { BoothBackend } from "../../server/backend";
import { BoothError } from "../../server/http/errors";
import { SseHub } from "../../server/http/sse";
import type { AskRequest, CompileResult, CompileRulesRequest, RunSummary } from "../../src/api/types";

const BASE = "http://127.0.0.1:8787";
const DECISION = "dec_abcdef123456";
const RUN: RunSummary = { runId: "run_x", scenario: "custom", outcome: "APPROVE", decisionId: DECISION };
const COMPILED: CompileResult = {
  source: "rules",
  rules: { budget: { amount_minor: 80_000, currency: "HKD" }, categories: ["apparel"], merchants: { allow: null, deny: [] }, seller_check: { require_capture: true } },
  validUntil: "2026-10-31T15:59:59Z",
  labels: [],
  notes: [],
  clamped: [],
  confirmRequired: true,
};

let hub: SseHub;
let asked: AskRequest[];
let alternatives: string[];
let compiled: CompileRulesRequest[];

function app(over: Partial<BoothBackend> = {}) {
  const backend: BoothBackend = {
    ...NOT_COMPOSED_BACKEND,
    ask: async (req) => (asked.push(req), RUN),
    suggestAlternatives: async (req) => (alternatives.push(req.decisionId), { ...RUN, alternativeTo: req.decisionId }),
    compileRules: async (req) => (compiled.push(req), COMPILED),
    ...over,
  };
  return createHttpApp({ backend: () => backend, hub });
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}, over: Partial<BoothBackend> = {}) =>
  app(over).request(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

async function errorOf(res: Response): Promise<{ code: string; message: string }> {
  expect(res.headers.get("content-type")).toContain("application/json");
  return ((await res.json()) as { error: { code: string; message: string } }).error;
}

beforeEach(() => {
  hub = new SseHub({ keepAliveMs: 60_000, maxQueuedChunks: 64 });
  asked = [];
  alternatives = [];
  compiled = [];
});
afterEach(() => hub.close());

describe("POST /api/ask", () => {
  it("runs the request and answers the RunSummary with the SSE id of its last event", async () => {
    const res = await post("/api/ask", { requestText: "a cotton tee", locale: "en" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RUN);
    expect(res.headers.get("x-event-seq")).not.toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(asked).toEqual([{ requestText: "a cotton tee", locale: "en" }]);
  });

  it("hands the backend the request as the planner reads it: NFKC, one space between words, trimmed; the locale is optional", async () => {
    await post("/api/ask", { requestText: "  ｔｅｅ　２  pieces\n please " });
    expect(asked).toEqual([{ requestText: "tee 2 pieces please" }]);
    await post("/api/ask", { requestText: "我想買件白色T恤，預算一百五十蚊", locale: "zh-HK" });
    expect(asked[1]).toEqual({ requestText: "我想買件白色T恤,預算一百五十蚊", locale: "zh-HK" }); // NFKC folds the full-width comma
  });

  it("caps the request at 1,000 characters after NFKC [F56]: 1,000 pass, 1,001 and an expansion do not", async () => {
    expect((await post("/api/ask", { requestText: "a".repeat(1_000) })).status).toBe(200);
    const long = await post("/api/ask", { requestText: "a".repeat(1_001) });
    expect(long.status).toBe(400);
    expect((await errorOf(long)).code).toBe("TEXT_TOO_LONG");
    const expanded = await post("/api/ask", { requestText: "ﬁ".repeat(600) }); // the fi ligature becomes two letters: 1,200 characters
    expect(expanded.status).toBe(400);
    expect((await errorOf(expanded)).code).toBe("TEXT_TOO_LONG");
    expect(asked).toHaveLength(1);
  });

  it.each([
    [{ requestText: "   " }, "INVALID_FIELD"],
    [{}, "INVALID_FIELD"],
    [{ requestText: 5 }, "INVALID_FIELD"],
    [{ requestText: "a tee", locale: "fr" }, "INVALID_FIELD"],
    [{ requestText: "a tee", extra: 1 }, "UNKNOWN_FIELD"],
  ])("refuses the body %j with %s and runs nothing", async (body, code) => {
    const res = await post("/api/ask", body);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe(code);
    expect(asked).toEqual([]);
  });

  it("applies the guards of every POST: foreign Origin, cross-site, wrong content type, foreign Host, body cap", async () => {
    for (const headers of [{ origin: "http://evil.example" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }]) {
      const res = await post("/api/ask", { requestText: "a tee" }, headers);
      expect(res.status).toBe(403);
      expect((await errorOf(res)).code).toBe("FORBIDDEN_ORIGIN");
    }
    const form = await app().request(`${BASE}/api/ask`, { method: "POST", headers: { "content-type": "text/plain" }, body: '{"requestText":"a tee"}' });
    expect(form.status).toBe(415);
    expect((await errorOf(form)).code).toBe("UNSUPPORTED_MEDIA_TYPE");
    const host = await app().request("http://evil.example:8787/api/ask", { method: "POST", headers: { host: "evil.example:8787", "content-type": "application/json" }, body: '{"requestText":"a tee"}' });
    expect(host.status).toBe(403);
    expect((await errorOf(host)).code).toBe("FORBIDDEN_HOST");
    const big = await post("/api/ask", JSON.stringify({ requestText: "x".repeat(MAX_BODY_BYTES) }));
    expect(big.status).toBe(413);
    expect(asked).toEqual([]);
    expect((await post("/api/ask", { requestText: "a tee" }, { origin: "http://127.0.0.1:5173" })).status).toBe(200);
  });

  it("passes a backend error through as JSON, and hides an unexpected one", async () => {
    const refused = await post("/api/ask", { requestText: "a tee" }, {}, { ask: () => Promise.reject(new BoothError(409, "NOT_SEALED", "no mandate is sealed yet")) });
    expect(refused.status).toBe(409);
    expect(await errorOf(refused)).toEqual({ code: "NOT_SEALED", message: "no mandate is sealed yet" });
    const boom = await post("/api/ask", { requestText: "a tee" }, {}, { ask: () => Promise.reject(new Error("secret detail at /Users/x")) });
    expect(boom.status).toBe(500);
    expect(JSON.stringify(await boom.json())).not.toContain("secret");
  });
});

describe("POST /api/alternatives", () => {
  it("replans after a budget stop and says which decision it was for", async () => {
    const res = await post("/api/alternatives", { decisionId: DECISION });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...RUN, alternativeTo: DECISION });
    expect(alternatives).toEqual([DECISION]);
  });

  it.each([
    [{ decisionId: "nope" }, "INVALID_FIELD"],
    [{}, "INVALID_FIELD"],
    [{ decisionId: DECISION, requestText: "cheaper" }, "UNKNOWN_FIELD"],
  ])("refuses %j with %s", async (body, code) => {
    const res = await post("/api/alternatives", body);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe(code);
    expect(alternatives).toEqual([]);
  });

  it("a decision with no cheaper options is a 409 NOT_APPLICABLE, and the guards apply", async () => {
    const res = await post("/api/alternatives", { decisionId: DECISION }, {}, { suggestAlternatives: () => Promise.reject(new BoothError(409, "NOT_APPLICABLE", "no")) });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("NOT_APPLICABLE");
    expect((await post("/api/alternatives", { decisionId: DECISION }, { origin: "http://evil.example" })).status).toBe(403);
  });
});

describe("POST /api/compile", () => {
  it("reads a sentence into a suggestion and sends no event id: it is not a run", async () => {
    const res = await post("/api/compile", { text: "HK$800 this month for clothes, verified sellers only", locale: "en" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(COMPILED);
    expect(res.headers.get("x-event-seq")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(compiled).toEqual([{ text: "HK$800 this month for clothes, verified sellers only", locale: "en" }]);
  });

  it("caps the sentence at the mandate's 280 characters after NFKC, and needs a locale", async () => {
    expect((await post("/api/compile", { text: "a".repeat(280), locale: "zh-HK" })).status).toBe(200);
    const long = await post("/api/compile", { text: "a".repeat(281), locale: "en" });
    expect(long.status).toBe(400);
    expect((await errorOf(long)).code).toBe("TEXT_TOO_LONG");
    for (const body of [{ text: "HK$800 for clothes" }, { text: "HK$800 for clothes", locale: "de" }, { text: " ", locale: "en" }, { text: "HK$800", locale: "en", x: 1 }]) {
      expect((await post("/api/compile", body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(compiled).toHaveLength(1);
  });

  it("applies the guards of every POST, and passes a 422 (no usable rules) through", async () => {
    expect((await post("/api/compile", { text: "HK$800", locale: "en" }, { origin: "http://evil.example" })).status).toBe(403);
    const wrongType = await app().request(`${BASE}/api/compile`, { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
    expect(wrongType.status).toBe(415);
    const none = await post("/api/compile", { text: "something nice", locale: "en" }, {}, { compileRules: () => Promise.reject(new BoothError(422, "CANNOT_COMPILE", "no amount")) });
    expect(none.status).toBe(422);
    expect((await errorOf(none)).code).toBe("CANNOT_COMPILE");
    expect(compiled).toEqual([]);
  });
});
