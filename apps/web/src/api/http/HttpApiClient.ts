// HttpApiClient: the ApiClient over the booth server (apps/web/server). JSON in and out are exactly the ApiClient
// types; trace events arrive over GET /api/events (SSE). A mutating call resolves only after the events it caused
// were delivered to subscribers (X-Event-Seq), so the UI sees a run's trace before its summary, as with the mock.
// Cards arrive without the rail handle (the server sends CardView, I8); the UI never reads the handle.
import type {
  AlternativesRequest,
  ApiClient,
  ApiInfo,
  AskRequest,
  BoothSnapshot,
  CompileResult,
  CompileRulesRequest,
  EscalationAnswerRequest,
  LogView,
  ProposeRequest,
  RevokeResult,
  RunSummary,
  ScenarioId,
  SealRequest,
  SealResult,
  TraceListener,
  Unsubscribe,
  VerifyOutcome,
} from "../types";
import { ApiRequestError, errorFromBody } from "./errors";
import { EventStream } from "./eventStream";

export interface HttpApiClientOptions {
  /** Origin of the booth server, e.g. http://127.0.0.1:8787. Default: same origin as the page. */
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  /** Longest wait for a request (a live run includes the planner [F33] and the judge [F34]). */
  readonly requestTimeoutMs?: number;
  /** Longest wait for the SSE stream to connect, and for a call's events to arrive. */
  readonly eventWaitMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_EVENT_WAIT_MS = 3_000;
const EVENT_SEQ_HEADER = "x-event-seq";

export class HttpApiClient implements ApiClient {
  readonly kind = "http" as const;
  readonly #base: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #eventWaitMs: number;
  readonly #stream: EventStream;

  constructor(opts: HttpApiClientOptions = {}) {
    this.#base = (opts.baseUrl ?? "").replace(/\/+$/, "");
    this.#fetch = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#timeoutMs = opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#eventWaitMs = opts.eventWaitMs ?? DEFAULT_EVENT_WAIT_MS;
    this.#stream = new EventStream({ url: `${this.#base}/api/events`, fetch: this.#fetch });
  }

  /** Closes the event stream. */
  dispose(): void {
    this.#stream.close();
  }

  subscribe(listener: TraceListener): Unsubscribe {
    return this.#stream.subscribe(listener);
  }

  info(): Promise<ApiInfo> {
    return this.#get<ApiInfo>("/api/info");
  }

  snapshot(): Promise<BoothSnapshot> {
    return this.#get<BoothSnapshot>("/api/snapshot");
  }

  getLog(): Promise<LogView> {
    return this.#get<LogView>("/api/log");
  }

  seal(req: SealRequest): Promise<SealResult> {
    return this.#post<SealResult>("/api/seal", req);
  }

  runScenario(id: ScenarioId): Promise<RunSummary> {
    return this.#post<RunSummary>(`/api/scenario/${encodeURIComponent(id)}`, {});
  }

  propose(req: ProposeRequest): Promise<RunSummary> {
    return this.#post<RunSummary>("/api/propose", req);
  }

  revoke(req: { readonly reason?: string } = {}): Promise<RevokeResult> {
    return this.#post<RevokeResult>("/api/revoke", req);
  }

  answerEscalation(req: EscalationAnswerRequest): Promise<RunSummary> {
    return this.#post<RunSummary>("/api/escalation/answer", req);
  }

  ask(req: AskRequest): Promise<RunSummary> {
    return this.#post<RunSummary>("/api/ask", req);
  }

  suggestAlternatives(req: AlternativesRequest): Promise<RunSummary> {
    return this.#post<RunSummary>("/api/alternatives", req);
  }

  /** Not a run: nothing streams, so it neither waits for the event stream nor for events. */
  compileRules(req: CompileRulesRequest): Promise<CompileResult> {
    return this.#request<CompileResult>("/api/compile", { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(req) });
  }

  verify(): Promise<VerifyOutcome> {
    return this.#post<VerifyOutcome>("/api/verify", {});
  }

  tamper(): Promise<LogView> {
    return this.#post<LogView>("/api/tamper", {});
  }

  restore(): Promise<LogView> {
    return this.#post<LogView>("/api/restore", {});
  }

  async reset(): Promise<void> {
    await this.#post<null>("/api/reset", {});
  }

  #get<T>(path: string): Promise<T> {
    return this.#request<T>(path, { method: "GET", headers: { accept: "application/json" } });
  }

  async #post<T>(path: string, body: unknown): Promise<T> {
    await this.#stream.ready(this.#eventWaitMs);
    const init: RequestInit = { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) };
    return this.#request<T>(path, init);
  }

  async #request<T>(path: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await this.#fetch(`${this.#base}${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(this.#timeoutMs) });
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "TimeoutError";
      throw new ApiRequestError(0, timedOut ? "TIMEOUT" : "NETWORK", timedOut ? "The booth server took too long to answer." : "The booth server cannot be reached.");
    }
    const seq = Number(res.headers.get(EVENT_SEQ_HEADER) ?? "0");
    const body = res.status === 204 ? null : await readJson(res);
    if (!res.ok) throw errorFromBody(res.status, body);
    if (Number.isSafeInteger(seq) && seq > 0) await this.#stream.waitFor(seq, this.#eventWaitMs);
    // The server builds these bodies from the same ApiClient types; the shape is the HTTP contract (server/http/routes.ts).
    return body as T;
  }
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    if (res.ok) throw new ApiRequestError(res.status, "BAD_RESPONSE", "The booth server sent an answer that is not JSON.");
    return null;
  }
}
