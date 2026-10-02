// The booth backend behind the HTTP routes: exactly the ApiClient operations (apps/web/src/api/types.ts) plus the
// export for the offline verifier page. The routes know nothing else, so the HTTP and SSE layer is tested on its
// own and the orchestrator-backed implementation (booth/backend.ts) plugs in behind the same interface.
import type { Checkpoint } from "@laisee/core/ports";
import type {
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
} from "../src/api/types";

/** data/public-keys.json shape, for the keys this server signs with right now. */
export interface PublicKeysView {
  readonly note: string;
  readonly engine: readonly string[];
  readonly delegator: string;
  readonly agent: string;
}

/** GET /api/export: everything the offline verifier page needs, pasted in as text. */
export interface ExportView {
  /** The stored log as JSONL (one JCS line per entry). Never the tampered copy. */
  readonly log: string;
  readonly publicKeys: PublicKeysView;
  readonly checkpoint: Checkpoint | null;
}

export interface BoothBackend {
  info(): Promise<ApiInfo>;
  snapshot(): Promise<BoothSnapshot>;
  seal(req: SealRequest): Promise<SealResult>;
  runScenario(id: ScenarioId): Promise<RunSummary>;
  propose(req: ProposeRequest): Promise<RunSummary>;
  revoke(req: { readonly reason?: string }): Promise<RevokeResult>;
  answerEscalation(req: EscalationAnswerRequest): Promise<RunSummary>;
  getLog(): Promise<LogView>;
  verify(): Promise<VerifyOutcome>;
  tamper(): Promise<LogView>;
  restore(): Promise<LogView>;
  reset(): Promise<void>;
  exportLog(): Promise<ExportView>;
  subscribe(listener: TraceListener): Unsubscribe;
}
