// LocalApiClient: on-device mode. The real stack (engine, orchestrator, cart builder, executor, signed hash-chained
// log, verifier, SIMULATED RailSim and merchant stub) runs in this page through the same booth backend as the Node
// server; the planner and the judge replay recorded answers; nothing leaves the device.
// DEMO SHORTCUT: the page plays the delegator. It makes throwaway keys in memory and signs the seal (the W3C VC 2.0
// credential), revocations and escalation answers itself, so in this mode the page holds every key. Keeping the
// delegator key apart on the phone comes later (KEYS.md).
// Every call is validated like an HTTP request body before it reaches the backend (fail closed).
import type {
  ApiClient,
  ApiInfo,
  BoothSnapshot,
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
import type { OrchestratorBackend } from "../../booth/backend/backend";
import type { ExportView } from "../../booth/backend/types";
import { parseAnswerRequest, parseProposeRequest, parseRevokeRequest, parseScenarioId, parseSealRequest, type JsonObject } from "../../booth/backend/validate";
import { LISTING_TEXT_HARD_CAP } from "../../booth/scenarios";
import { composeLocalBackend, type LocalComposeOptions } from "./compose";

/** The server ticks every second (R11 windows [F31] are 60 s, card TTL [F30] 30 min); so does the page. */
export const LOCAL_TICK_MS = 1_000;

export interface LocalApiClientOptions extends LocalComposeOptions {
  /** Expiry tick interval; null = no timer (tests tick by hand with tick()). */
  readonly tickMs?: number | null;
}

/** A typed request object, read as the JSON body it stands for. */
const asBody = (value: object): JsonObject => value as JsonObject;

export class LocalApiClient implements ApiClient {
  readonly kind = "local" as const;
  readonly #backend: OrchestratorBackend;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: LocalApiClientOptions = {}) {
    this.#backend = composeLocalBackend(opts);
    const tickMs = opts.tickMs === undefined ? LOCAL_TICK_MS : opts.tickMs;
    if (tickMs !== null) this.#timer = setInterval(() => void this.tick(), tickMs);
  }

  /** Stops the tick timer and drops the session. */
  dispose(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
    this.#backend.close();
  }

  /** Lets due expiries happen (R11 escalation windows, card TTL, packet expiry). */
  tick(): Promise<void> {
    return this.#backend.tick();
  }

  subscribe(listener: TraceListener): Unsubscribe {
    return this.#backend.subscribe(listener);
  }

  info(): Promise<ApiInfo> {
    return this.#backend.info();
  }

  snapshot(): Promise<BoothSnapshot> {
    return this.#backend.snapshot();
  }

  getLog(): Promise<LogView> {
    return this.#backend.getLog();
  }

  async seal(req: SealRequest): Promise<SealResult> {
    return this.#backend.seal(parseSealRequest(asBody(req)));
  }

  async runScenario(id: ScenarioId): Promise<RunSummary> {
    return this.#backend.runScenario(parseScenarioId(id));
  }

  async propose(req: ProposeRequest): Promise<RunSummary> {
    return this.#backend.propose(parseProposeRequest(asBody(req), LISTING_TEXT_HARD_CAP));
  }

  async revoke(req: { readonly reason?: string } = {}): Promise<RevokeResult> {
    return this.#backend.revoke(parseRevokeRequest(asBody(req)));
  }

  async answerEscalation(req: EscalationAnswerRequest): Promise<RunSummary> {
    return this.#backend.answerEscalation(parseAnswerRequest(asBody(req)));
  }

  verify(): Promise<VerifyOutcome> {
    return this.#backend.verify();
  }

  tamper(): Promise<LogView> {
    return this.#backend.tamper();
  }

  restore(): Promise<LogView> {
    return this.#backend.restore();
  }

  reset(): Promise<void> {
    return this.#backend.reset();
  }

  /** The stored log as JSONL plus the public keys and head, for the offline verifier page (not part of ApiClient). */
  exportLog(): Promise<ExportView> {
    return this.#backend.exportLog();
  }
}
