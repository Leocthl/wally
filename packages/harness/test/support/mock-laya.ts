// A local HTTP server that speaks the Laya wire format (services/laya/FINDINGS.md) for tests. Binds 127.0.0.1 only.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface WireQuestion {
  readonly type: string;
  readonly instructions: string;
  readonly criteria: Readonly<Record<string, string>>;
  readonly option_order?: readonly number[];
}

export interface WireRequest {
  readonly model: string;
  readonly state: unknown;
  readonly questions: Readonly<Record<string, WireQuestion>>;
}

export interface MockResponse {
  readonly status?: number;
  readonly body?: unknown;
  readonly rawBody?: string;
  readonly delayMs?: number;
}

export type Responder = (req: WireRequest, seen: readonly WireRequest[]) => MockResponse;

export interface MockLaya {
  readonly url: string;
  readonly requests: () => readonly WireRequest[];
  close(): Promise<void>;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Answers every question with `probFor(label, position)` where position is the label's place in that row's option order. */
export function biasedResponder(probFor: (labels: readonly string[], order: readonly number[]) => readonly number[], truncated = false): Responder {
  return (req) => {
    const answers: Record<string, unknown> = {};
    for (const [id, q] of Object.entries(req.questions)) {
      const labels = Object.keys(q.criteria);
      const order = q.option_order ?? labels.map((_, i) => i);
      const shown = probFor(labels, order);
      const probabilities = Object.fromEntries(order.map((labelIndex, position) => [labels[labelIndex] as string, shown[position] as number]));
      const choice = Object.entries(probabilities).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      answers[id] = { type: "choice", choice, probabilities };
    }
    return { body: { model: "laya-rl-agent", answers, usage: { input_tokens: 100, output_tokens: 0, state_tokens: 40, state_tokens_dropped: 0, truncated, truncated_questions: [] } } };
  };
}

export async function startMockLaya(responder: Responder): Promise<MockLaya> {
  let seen: readonly WireRequest[] = [];
  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const wire = JSON.parse(await readBody(req)) as WireRequest;
    const out = responder(wire, seen);
    seen = [...seen, wire];
    if (out.delayMs) await new Promise((r) => setTimeout(r, out.delayMs));
    res.writeHead(out.status ?? 200, { "content-type": "application/json" });
    res.end(out.rawBody ?? JSON.stringify(out.body ?? {}));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests: () => seen,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
