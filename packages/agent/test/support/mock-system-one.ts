// Mock SystemOne server for tests (node:http on an ephemeral port, loopback only). It speaks the Laya/Jev
// wire format closely enough to exercise the adapter: canned answers, optional option-order bias, delays,
// HTTP errors, malformed JSON, truncated usage, redirects, hangs and dropped sockets. No network beyond loopback.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { BASE_DISTRIBUTIONS, CLEAN_USAGE, type Dist, type Distributions } from "./wire";

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  /** Lower-cased header names. */
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  /** Parsed JSON when the body parsed, else the raw text. */
  readonly body: unknown;
}

export type MockReply =
  | {
      readonly kind: "ok";
      readonly dists?: Partial<Distributions>;
      readonly usage?: Readonly<Record<string, unknown>>;
      readonly model?: string;
      readonly routingModel?: string;
      /** Moves this share of every question's mass onto the option shown first (position bias). */
      readonly positionBias?: number;
    }
  | { readonly kind: "json"; readonly status?: number; readonly body: unknown }
  | { readonly kind: "raw"; readonly status?: number; readonly body: string }
  | { readonly kind: "http"; readonly status: number; readonly body?: string }
  | { readonly kind: "redirect"; readonly location: string }
  | { readonly kind: "hang" }
  | { readonly kind: "destroy" }
  | { readonly kind: "delay"; readonly ms: number; readonly then: MockReply };

export type MockBehavior = MockReply | ((req: RecordedRequest) => MockReply);

export interface MockSystemOne {
  readonly baseUrl: string;
  /** Every request seen, in order (health checks included). */
  readonly requests: () => readonly RecordedRequest[];
  /** POST /v1/systemone requests only. */
  readonly judgeRequests: () => readonly RecordedRequest[];
  readonly setBehavior: (behavior: MockBehavior) => void;
  readonly setHealth: (body: unknown | null) => void;
  readonly close: () => Promise<void>;
}

export const MOCK_REVISION = "55cf4c4ef5ae1c7a8d0f9f1d2b6e3a4c9d8e7f60";

interface WireQuestionBody {
  readonly criteria?: Readonly<Record<string, string>>;
  readonly option_order?: readonly number[];
}

const baseQuestion = (id: string): string => id.replace(/__r\d+$/, "");

function answerFor(id: string, q: WireQuestionBody, dists: Partial<Distributions>, bias: number) {
  const labels = Object.keys(q.criteria ?? {});
  const base: Dist = (dists as Record<string, Dist | undefined>)[baseQuestion(id)] ??
    (BASE_DISTRIBUTIONS as Record<string, Dist>)[baseQuestion(id)] ??
    Object.fromEntries(labels.map((l) => [l, 1 / labels.length]));
  const firstIndex = q.option_order?.[0] ?? 0;
  const first = labels[firstIndex];
  const probabilities = Object.fromEntries(
    labels.map((l) => [l, (1 - bias) * (base[l] ?? 0) + (l === first ? bias : 0)]),
  );
  const top = labels.reduce((best, l) => ((probabilities[l] ?? 0) > (probabilities[best] ?? 0) ? l : best), labels[0] ?? "");
  return {
    type: "choice",
    choice: top,
    probabilities,
    confidence: 0.1,
    answer_confidence: probabilities[top] ?? 0,
    action: { act_probability: 1.0 },
  };
}

function okBody(reply: Extract<MockReply, { kind: "ok" }>, request: RecordedRequest): unknown {
  const questions = (request.body as { questions?: Record<string, WireQuestionBody> } | null)?.questions ?? {};
  const answers = Object.fromEntries(
    Object.entries(questions).map(([id, q]) => [id, answerFor(id, q, reply.dists ?? {}, reply.positionBias ?? 0)]),
  );
  return {
    model: reply.model ?? "laya-rl-agent",
    answers,
    usage: { ...CLEAN_USAGE, ...(reply.usage ?? {}) },
    routing: { model: reply.routingModel ?? "typed-decisions", repo: "convaiinnovations/laya/typed-decisions" },
  };
}

function parseBody(text: string): unknown {
  try {
    return text.length > 0 ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

export async function startMockSystemOne(initial: MockBehavior = { kind: "ok" }): Promise<MockSystemOne> {
  let behavior: MockBehavior = initial;
  let health: unknown | null = { status: "ok", loaded: ["typed-decisions"], revisions: { "typed-decisions": MOCK_REVISION } };
  const seen: RecordedRequest[] = [];
  const sockets = new Set<Socket>();
  const timers = new Set<NodeJS.Timeout>();

  const send = (res: ServerResponse, status: number, body: string, type = "application/json") => {
    if (res.writableEnded || res.destroyed) return;
    res.writeHead(status, { "content-type": type });
    res.end(body);
  };

  const respond = (reply: MockReply, res: ServerResponse, request: RecordedRequest): void => {
    switch (reply.kind) {
      case "ok":
        return send(res, 200, JSON.stringify(okBody(reply, request)));
      case "json":
        return send(res, reply.status ?? 200, JSON.stringify(reply.body));
      case "raw":
        return send(res, reply.status ?? 200, reply.body);
      case "http":
        return send(res, reply.status, reply.body ?? JSON.stringify({ detail: "inference failed" }));
      case "redirect":
        if (!res.writableEnded) res.writeHead(302, { location: reply.location }).end();
        return;
      case "hang":
        return;
      case "destroy":
        return void res.socket?.destroy();
      case "delay": {
        const timer = setTimeout(() => {
          timers.delete(timer);
          respond(reply.then, res, request);
        }, reply.ms);
        timers.add(timer);
      }
    }
  };

  const server: Server = createServer((req, res) => {
    void readBody(req).then((text) => {
      const body = parseBody(text);
      const path = (req.url ?? "").split("?")[0] ?? "";
      const request: RecordedRequest = { method: req.method ?? "", path, headers: req.headers, body };
      seen.push(request);
      if (req.method === "GET" && path === "/health") {
        return health === null ? send(res, 404, "{}") : send(res, 200, JSON.stringify(health));
      }
      if (req.method === "POST" && path === "/v1/systemone") {
        return respond(typeof behavior === "function" ? behavior(request) : behavior, res, request);
      }
      send(res, 404, JSON.stringify({ detail: "not found" }));
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests: () => [...seen],
    judgeRequests: () => seen.filter((r) => r.method === "POST" && r.path === "/v1/systemone"),
    setBehavior: (next) => {
      behavior = next;
    },
    setHealth: (next) => {
      health = next;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
