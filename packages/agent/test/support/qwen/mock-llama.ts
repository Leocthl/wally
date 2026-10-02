// Test helper: a small mock of llama-server (POST /v1/chat/completions, GET /health) on an ephemeral loopback
// port. Canned answers, delays, a hang, HTTP errors, malformed JSON, refusals, truncation and redirects, so the
// local planner and the compiler can be tested offline. Test support code only; it keeps mutable behaviour so a
// test can switch faults on and off.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface RecordedChat {
  readonly path: string;
  readonly rawBody: string;
  readonly body: ChatBody | null;
}

export interface ChatBody {
  readonly model: string;
  readonly messages: readonly { readonly role: string; readonly content: string }[];
  readonly temperature: number;
  readonly top_k: number;
  readonly seed: number;
  readonly max_tokens: number;
  readonly chat_template_kwargs: { readonly enable_thinking: boolean };
  readonly response_format: { readonly type: string; readonly json_schema: { readonly name: string; readonly strict: boolean; readonly schema: unknown } };
}

/** What the mock answers with: assistant content (JSON text) computed from the request body. */
export type Answerer = (body: ChatBody) => string;

export interface MockLlamaBehavior {
  readonly answer: Answerer;
  readonly status: number;
  readonly delayMs: number;
  /** Never answers (the client must time out). */
  readonly hang: boolean;
  /** Whole response body, replacing the OpenAI envelope. */
  readonly rawResponse: string | null;
  readonly finishReason: string;
  readonly refusal: string | null;
  /** 307 to this location instead of answering. */
  readonly redirectTo: string | null;
}

export const DEFAULT_LLAMA_BEHAVIOR: MockLlamaBehavior = {
  answer: () => JSON.stringify({ action: "give_up", note: "default mock answer" }),
  status: 200,
  delayMs: 0,
  hang: false,
  rawResponse: null,
  finishReason: "stop",
  refusal: null,
  redirectTo: null,
};

export interface MockLlama {
  readonly url: string;
  readonly requests: () => readonly RecordedChat[];
  readonly set: (patch: Partial<MockLlamaBehavior>) => void;
  readonly reset: () => void;
  readonly close: () => Promise<void>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parse(text: string): ChatBody | null {
  try {
    return JSON.parse(text) as ChatBody;
  } catch {
    return null;
  }
}

function send(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body);
}

function envelope(content: string, b: MockLlamaBehavior): string {
  return JSON.stringify({
    choices: [{ finish_reason: b.finishReason, index: 0, message: { role: "assistant", content, ...(b.refusal === null ? {} : { refusal: b.refusal }) } }],
    created: 1,
    model: "mock-qwen",
    object: "chat.completion",
    usage: { completion_tokens: 20, prompt_tokens: 300, total_tokens: 320 },
    timings: { prompt_per_second: 500, predicted_per_second: 25 },
  });
}

export async function startMockLlama(initial: Partial<MockLlamaBehavior> = {}): Promise<MockLlama> {
  let behavior: MockLlamaBehavior = { ...DEFAULT_LLAMA_BEHAVIOR, ...initial };
  let recorded: readonly RecordedChat[] = [];
  const server: Server = createServer((req, res) => {
    void (async () => {
      const path = req.url ?? "";
      if (req.method === "GET" && path === "/health") return send(res, 200, JSON.stringify({ status: "ok" }));
      const rawBody = await readBody(req);
      const body = parse(rawBody);
      recorded = [...recorded, { path, rawBody, body }];
      if (behavior.hang) return; // never answers; closeAllConnections ends it at teardown
      if (behavior.delayMs > 0) await new Promise((r) => setTimeout(r, behavior.delayMs));
      if (behavior.redirectTo !== null) {
        res.writeHead(307, { location: behavior.redirectTo });
        return res.end();
      }
      if (req.method !== "POST" || path !== "/v1/chat/completions") return send(res, 404, "{}");
      if (behavior.status !== 200) return send(res, behavior.status, JSON.stringify({ error: { message: "mock failure" } }));
      if (behavior.rawResponse !== null) return send(res, 200, behavior.rawResponse);
      if (body === null) return send(res, 400, JSON.stringify({ error: { message: "bad json" } }));
      return send(res, 200, envelope(behavior.answer(body), behavior));
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests: () => recorded,
    set: (patch) => {
      behavior = { ...behavior, ...patch };
    },
    reset: () => {
      behavior = { ...DEFAULT_LLAMA_BEHAVIOR, ...initial };
      recorded = [];
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** An answerer that proposes `title` x `qty` from the first listing whose schema branch offers it. */
export function proposeAnswer(listingUrl: string, title: string, qty = 1, note = "the request names it"): Answerer {
  return () => JSON.stringify({ action: "propose", listing_url: listingUrl, items: [{ title, qty }], note });
}

export const abstainAnswer = (action: "ask_shopper" | "give_up"): Answerer => () => JSON.stringify({ action, note: "unclear request" });

/** The user message of a recorded request (the prompt the planner sent). */
export function userMessage(chat: RecordedChat | undefined): string {
  return chat?.body?.messages.find((m) => m.role === "user")?.content ?? "";
}

/** Listing urls and titles the answer schema of a recorded request allows. */
export function schemaChoices(chat: RecordedChat | undefined): { readonly urls: readonly string[]; readonly titles: readonly string[] } {
  const schema = chat?.body?.response_format.json_schema.schema as { anyOf?: readonly Record<string, unknown>[] } | undefined;
  const branches = schema?.anyOf ?? [];
  const props = branches.map((b) => b["properties"] as Record<string, { const?: string; items?: { properties?: { title?: { enum?: string[] } } } }>);
  const urls = props.flatMap((p) => (typeof p["listing_url"]?.const === "string" ? [p["listing_url"].const] : []));
  const titles = props.flatMap((p) => p["items"]?.items?.properties?.title?.enum ?? []);
  return { urls, titles };
}
