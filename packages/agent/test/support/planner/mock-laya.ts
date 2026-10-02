// Test helper: a small mock of the Laya server (POST /v1/systemone, GET /health) on an ephemeral port.
// Wire format: services/laya/FINDINGS.md. Deterministic: probabilities come from a keyword scorer, so a
// request naming an item scores that item high and a vague request scores the none option high.
// Test support code only; it keeps mutable behaviour so a test can switch faults on and off.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface MockQuestion {
  readonly type?: string;
  readonly instructions: string;
  readonly criteria: Readonly<Record<string, string>>;
  readonly option_order?: readonly number[];
}

export interface RecordedRequest {
  readonly path: string;
  readonly body: unknown;
  readonly rawBody: string;
}

/** What a scorer sees: the base question id (without the __r rotation suffix), its labels and the state. */
export interface ScorerInput {
  readonly questionId: string;
  readonly instructions: string;
  readonly criteria: Readonly<Record<string, string>>;
  readonly state: unknown;
}

/** Non-negative weights per label; the server normalises them to probabilities. */
export type Scorer = (input: ScorerInput) => Readonly<Record<string, number>>;

export interface MockBehavior {
  readonly scorer: Scorer;
  /** Extra weight multiplier for the option shown first in a row (position bias, cancelled by rotations). */
  readonly firstPositionBias: number;
  readonly status: number;
  readonly delayMs: number;
  readonly rawResponse: string | null;
  readonly truncated: boolean;
  readonly dropLabel: string | null;
}

const STOPWORDS = new Set(["a", "an", "the", "please", "i", "want", "me", "buy", "get", "some", "of", "in", "for", "to", "and", "my", "one", "this", "that"]);
const NONE_LABEL = "none_of_these";
const NONE_BASELINE = 0.35;
const NEXT_ACTION_WEIGHTS: Readonly<Record<string, number>> = { propose: 0.7, replan_cheaper: 0.1, ask_shopper: 0.1, give_up: 0.1 };

function tokens(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

function requestOf(state: unknown): string {
  if (typeof state === "object" && state !== null && "request" in state && typeof state.request === "string") return state.request;
  return "";
}

/** Keyword scorer: weight = small floor + (shared tokens with the request) squared; the none option has a fixed baseline. */
export const keywordScorer: Scorer = ({ questionId, criteria, state }) => {
  if (questionId === "next_action") {
    return Object.fromEntries(Object.keys(criteria).map((label) => [label, NEXT_ACTION_WEIGHTS[label] ?? 0.05]));
  }
  const wanted = new Set(tokens(requestOf(state)));
  const weights = Object.entries(criteria).map(([label, description]): [string, number] => {
    if (label === NONE_LABEL) return [label, NONE_BASELINE];
    const shared = tokens(`${label.replace(/_/g, " ")} ${description}`).filter((t) => wanted.has(t));
    return [label, 0.05 + new Set(shared).size ** 2];
  });
  return Object.fromEntries(weights);
};

export const DEFAULT_BEHAVIOR: MockBehavior = {
  scorer: keywordScorer,
  firstPositionBias: 0,
  status: 200,
  delayMs: 0,
  rawResponse: null,
  truncated: false,
  dropLabel: null,
};

export interface MockLaya {
  readonly url: string;
  readonly requests: () => readonly RecordedRequest[];
  readonly set: (patch: Partial<MockBehavior>) => void;
  readonly reset: () => void;
  readonly close: () => Promise<void>;
}

function baseId(rotatedId: string): string {
  const at = rotatedId.indexOf("__r");
  return at < 0 ? rotatedId : rotatedId.slice(0, at);
}

function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

function answerFor(id: string, q: MockQuestion, state: unknown, b: MockBehavior) {
  const labels = Object.keys(q.criteria);
  const weights = b.scorer({ questionId: baseId(id), instructions: q.instructions, criteria: q.criteria, state });
  const firstLabel = labels[q.option_order?.[0] ?? 0];
  const biased = labels.map((l) => (weights[l] ?? 0.01) * (l === firstLabel ? 1 + b.firstPositionBias : 1));
  const total = biased.reduce((a, c) => a + c, 0);
  const probabilities = Object.fromEntries(
    labels.flatMap((l, i) => (l === b.dropLabel ? [] : [[l, round4((biased[i] ?? 0) / total)] as const])),
  );
  const top = Object.entries(probabilities).reduce((best, e) => (e[1] > best[1] ? e : best));
  return { type: "choice", choice: top[0], probabilities, confidence: 0.1, answer_confidence: top[1], action: { act_probability: 1 } };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function send(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body);
}

function systemOne(raw: string, b: MockBehavior): { status: number; body: string } {
  if (b.status !== 200) return { status: b.status, body: JSON.stringify({ detail: "inference failed" }) };
  if (b.rawResponse !== null) return { status: 200, body: b.rawResponse };
  const parsed = JSON.parse(raw) as { state: unknown; questions: Record<string, MockQuestion> };
  const answers = Object.fromEntries(Object.entries(parsed.questions).map(([id, q]) => [id, answerFor(id, q, parsed.state, b)]));
  const ids = Object.keys(parsed.questions);
  const usage = { input_tokens: 100, output_tokens: 0, state_tokens: 20, state_tokens_dropped: b.truncated ? 5 : 0, truncated: b.truncated, truncated_questions: b.truncated ? ids : [] };
  return { status: 200, body: JSON.stringify({ model: "laya-rl-agent", answers, usage }) };
}

export async function startMockLaya(initial: Partial<MockBehavior> = {}): Promise<MockLaya> {
  let behavior: MockBehavior = { ...DEFAULT_BEHAVIOR, ...initial };
  let recorded: readonly RecordedRequest[] = [];
  const server: Server = createServer((req, res) => {
    void (async () => {
      const path = req.url ?? "";
      if (req.method === "GET" && path === "/health") return send(res, 200, JSON.stringify({ status: "ok", loaded: ["typed-decisions"] }));
      const rawBody = await readBody(req);
      recorded = [...recorded, { path, body: parseJson(rawBody), rawBody }];
      if (behavior.delayMs > 0) await new Promise((r) => setTimeout(r, behavior.delayMs));
      if (req.method !== "POST" || path !== "/v1/systemone") return send(res, 404, "{}");
      try {
        const out = systemOne(rawBody, behavior);
        return send(res, out.status, out.body);
      } catch {
        return send(res, 400, JSON.stringify({ detail: "bad request" }));
      }
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
      behavior = { ...DEFAULT_BEHAVIOR, ...initial };
      recorded = [];
    },
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
