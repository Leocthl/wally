// Small client for llama-server's OpenAI-compatible POST /v1/chat/completions (services/qwen). One request per
// call: temperature 0, a fixed seed, thinking off, and the output constrained to a JSON schema (llama-server
// turns it into a grammar). Loopback only unless the composition root allows a remote host. Every failure is
// a value with a fixed reason word, never a throw and never fetch's own error text (I5, audit S-PLAN-1).
import { PlannerConfigError } from "../config";
import { postJson } from "../http";

export interface ChatMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

export interface ChatRequest {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  /** Name and JSON schema of the answer; the server constrains decoding to it. */
  readonly schemaName: string;
  readonly schema: unknown;
  readonly maxTokens: number;
  readonly seed: number;
}

export interface ChatUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface ChatTimings {
  readonly promptPerSecond: number | null;
  readonly predictedPerSecond: number | null;
}

export type ChatFailure = "timeout" | "network" | "too_large" | "http_error" | "invalid_response" | "truncated" | "refusal";

export type ChatResult =
  | {
      readonly ok: true;
      readonly content: string;
      readonly latencyMs: number;
      readonly usage: ChatUsage | null;
      readonly timings: ChatTimings | null;
      /** Model name the server reported, for the trace and the evaluation report. */
      readonly model: string | null;
    }
  | { readonly ok: false; readonly reason: ChatFailure; readonly latencyMs: number; readonly status?: number };

export interface ChatClient {
  complete(request: ChatRequest, timeoutMs: number): Promise<ChatResult>;
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);
/** "scheme://user@host": user info in the authority part (refused, never echoed). */
const USERINFO = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i;

/** Request body bytes: the same request always gives the same bytes (fixed key order, no clock, no random). */
export function buildChatBody(request: ChatRequest): string {
  return JSON.stringify({
    model: request.model,
    messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: 0,
    top_k: 1,
    seed: request.seed,
    max_tokens: request.maxTokens,
    stream: false,
    chat_template_kwargs: { enable_thinking: false },
    response_format: { type: "json_schema", json_schema: { name: request.schemaName, strict: true, schema: request.schema } },
  });
}

/** Endpoint for a base URL; throws PlannerConfigError for a non-loopback host unless allowRemote, or userinfo. */
export function chatCompletionsUrl(baseUrl: string, allowRemote: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new PlannerConfigError("PLANNER_BASE_URL is not a valid url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new PlannerConfigError("PLANNER_BASE_URL must be an http or https url");
  if (USERINFO.test(baseUrl.trim())) throw new PlannerConfigError("PLANNER_BASE_URL must not carry user info before the host");
  if (!allowRemote && !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new PlannerConfigError(
      `The local planner talks to a loopback server only (127.0.0.1, localhost or ::1), got ${parsed.hostname}; the shopper request would leave this machine. Set PLANNER_ALLOW_REMOTE=1 to allow it`,
    );
  }
  return `${parsed.origin}/v1/chat/completions`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const finiteOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function readUsage(json: Record<string, unknown>): ChatUsage | null {
  const usage = json["usage"];
  if (!isRecord(usage)) return null;
  const promptTokens = finiteOrNull(usage["prompt_tokens"]);
  const completionTokens = finiteOrNull(usage["completion_tokens"]);
  return promptTokens === null || completionTokens === null ? null : { promptTokens, completionTokens };
}

function readTimings(json: Record<string, unknown>): ChatTimings | null {
  const timings = json["timings"];
  if (!isRecord(timings)) return null;
  return { promptPerSecond: finiteOrNull(timings["prompt_per_second"]), predictedPerSecond: finiteOrNull(timings["predicted_per_second"]) };
}

type Parsed = { readonly ok: true; readonly content: string; readonly json: Record<string, unknown> } | { readonly ok: false; readonly reason: ChatFailure };

function parseCompletion(text: string): Parsed {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid_response" };
  }
  if (!isRecord(json) || !Array.isArray(json["choices"])) return { ok: false, reason: "invalid_response" };
  const [choice] = json["choices"] as unknown[];
  if (!isRecord(choice) || !isRecord(choice["message"])) return { ok: false, reason: "invalid_response" };
  const message = choice["message"];
  const refusal = message["refusal"];
  if (typeof refusal === "string" && refusal.trim() !== "") return { ok: false, reason: "refusal" };
  if (choice["finish_reason"] === "length") return { ok: false, reason: "truncated" };
  if (choice["finish_reason"] !== "stop") return { ok: false, reason: "invalid_response" };
  const content = message["content"];
  return typeof content === "string" ? { ok: true, content, json } : { ok: false, reason: "invalid_response" };
}

export function createChatClient(options: { readonly baseUrl: string; readonly allowRemote?: boolean }): ChatClient {
  const endpoint = chatCompletionsUrl(options.baseUrl, options.allowRemote === true);
  return {
    async complete(request, timeoutMs) {
      const started = performance.now();
      const elapsed = (): number => Math.round(performance.now() - started);
      try {
        if (!Number.isFinite(timeoutMs) || Math.floor(timeoutMs) < 1) return { ok: false, reason: "timeout", latencyMs: 0 };
        const out = await postJson(endpoint, buildChatBody(request), Math.floor(timeoutMs));
        if (out.kind !== "response") return { ok: false, reason: out.kind, latencyMs: elapsed() };
        if (out.status < 200 || out.status > 299) return { ok: false, reason: "http_error", status: out.status, latencyMs: elapsed() };
        const parsed = parseCompletion(out.text);
        if (!parsed.ok) return { ok: false, reason: parsed.reason, latencyMs: elapsed() };
        const model = typeof parsed.json["model"] === "string" ? parsed.json["model"] : null;
        return { ok: true, content: parsed.content, latencyMs: elapsed(), usage: readUsage(parsed.json), timings: readTimings(parsed.json), model };
      } catch {
        return { ok: false, reason: "network", latencyMs: elapsed() };
      }
    },
  };
}
