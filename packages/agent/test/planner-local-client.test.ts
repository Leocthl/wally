// Chat client for the local Qwen server: request shape, deterministic bytes, loopback guard, and every failure
// as a fixed reason word (never a throw, never fetch's message). Offline, against the mock llama-server.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PlannerConfigError } from "../src/planner/config";
import { buildChatBody, chatCompletionsUrl, createChatClient, type ChatRequest } from "../src/planner/local/client";
import { startMockLlama, type MockLlama } from "./support/qwen/mock-llama";

let mock: MockLlama;
beforeAll(async () => {
  mock = await startMockLlama();
});
afterAll(async () => {
  await mock.close();
});
beforeEach(() => mock.reset());

const REQUEST: ChatRequest = {
  model: "qwen3.5-9b-q4km",
  messages: [
    { role: "system", content: "system text" },
    { role: "user", content: "我想買兩對襪" },
  ],
  schemaName: "wally_plan",
  schema: { type: "object", properties: { action: { enum: ["give_up"] } } },
  maxTokens: 160,
  seed: 42,
};
const T = 5_000;

describe("request shape", () => {
  it("posts one OpenAI chat completion: temperature 0, fixed seed, thinking off, json_schema response format", async () => {
    const out = await createChatClient({ baseUrl: mock.url }).complete(REQUEST, T);
    expect(out.ok).toBe(true);
    const [req] = mock.requests();
    expect(req?.path).toBe("/v1/chat/completions");
    expect(req?.body?.temperature).toBe(0);
    expect(req?.body?.top_k).toBe(1);
    expect(req?.body?.seed).toBe(42);
    expect(req?.body?.max_tokens).toBe(160);
    expect(req?.body?.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(req?.body?.response_format.type).toBe("json_schema");
    expect(req?.body?.response_format.json_schema.schema).toEqual(REQUEST.schema);
    expect(mock.requests()).toHaveLength(1);
  });

  it("gives the same bytes for the same request", () => {
    expect(buildChatBody(REQUEST)).toBe(buildChatBody({ ...REQUEST, messages: REQUEST.messages.map((m) => ({ ...m })) }));
  });

  it("returns content, usage, timings and the server's model name", async () => {
    mock.set({ answer: () => '{"action":"give_up","note":"x"}' });
    const out = await createChatClient({ baseUrl: mock.url }).complete(REQUEST, T);
    expect(out).toMatchObject({ ok: true, content: '{"action":"give_up","note":"x"}', model: "mock-qwen", usage: { promptTokens: 300, completionTokens: 20 } });
  });
});

describe("loopback guard", () => {
  it("accepts 127.0.0.1, localhost and ::1", () => {
    expect(chatCompletionsUrl("http://127.0.0.1:8809", false)).toBe("http://127.0.0.1:8809/v1/chat/completions");
    expect(chatCompletionsUrl("http://localhost:8809/", false)).toBe("http://localhost:8809/v1/chat/completions");
    expect(chatCompletionsUrl("http://[::1]:8809", false)).toBe("http://[::1]:8809/v1/chat/completions");
  });

  it("refuses a remote host unless allowRemote, and refuses user info and odd schemes always", () => {
    expect(() => createChatClient({ baseUrl: "https://example.com" })).toThrow(PlannerConfigError);
    expect(() => createChatClient({ baseUrl: "http://0.0.0.0:8809" })).toThrow(/loopback/);
    expect(chatCompletionsUrl("https://example.com", true)).toBe("https://example.com/v1/chat/completions");
    expect(() => chatCompletionsUrl("http://user:secret@127.0.0.1:8809", true)).toThrow(PlannerConfigError);
    expect(() => chatCompletionsUrl("http://user:secret@127.0.0.1:8809", true)).not.toThrow(/secret/);
    expect(() => chatCompletionsUrl("file:///etc/hosts", true)).toThrow(PlannerConfigError);
    expect(() => chatCompletionsUrl("not a url", false)).toThrow(PlannerConfigError);
  });
});

describe("fails closed with a reason word, never a throw", () => {
  const reasonOf = async (patch: Parameters<MockLlama["set"]>[0], timeoutMs = T) => {
    mock.set(patch);
    const out = await createChatClient({ baseUrl: mock.url }).complete(REQUEST, timeoutMs);
    return out.ok ? "ok" : out.reason;
  };

  it("HTTP 500", async () => expect(await reasonOf({ status: 500 })).toBe("http_error"));
  it("malformed JSON", async () => expect(await reasonOf({ rawResponse: "{not json" })).toBe("invalid_response"));
  it("an envelope without choices", async () => expect(await reasonOf({ rawResponse: '{"object":"chat.completion"}' })).toBe("invalid_response"));
  it("a refusal", async () => expect(await reasonOf({ refusal: "I cannot help with that" })).toBe("refusal"));
  it("a cut-off answer (finish_reason length)", async () => expect(await reasonOf({ finishReason: "length" })).toBe("truncated"));
  it("a slow answer past the timeout", async () => expect(await reasonOf({ delayMs: 400 }, 100)).toBe("timeout"));
  it("a server that never answers", async () => expect(await reasonOf({ hang: true }, 150)).toBe("timeout"));
  it("no time budget", async () => expect(await reasonOf({}, 0)).toBe("timeout"));
  it("a body over the 1 MiB cap", async () => expect(await reasonOf({ rawResponse: `"${"x".repeat((1 << 20) + 10)}"` })).toBe("too_large"));

  it("an unreachable server", async () => {
    const closed = await startMockLlama();
    const url = closed.url;
    await closed.close();
    const out = await createChatClient({ baseUrl: url }).complete(REQUEST, T);
    expect(out).toMatchObject({ ok: false, reason: "network" });
  });

  it("a redirect: refused, and the request never reaches the other host", async () => {
    const seen: string[] = [];
    const sink: Server = createServer((req, res) => {
      seen.push(req.url ?? "");
      res.end("{}");
    });
    await new Promise<void>((resolve) => sink.listen(0, "127.0.0.1", resolve));
    const port = (sink.address() as AddressInfo).port;
    expect(await reasonOf({ redirectTo: `http://127.0.0.1:${port}/v1/chat/completions` })).toBe("network");
    expect(seen).toEqual([]);
    await new Promise<void>((resolve) => sink.close(() => resolve()));
  });
});
