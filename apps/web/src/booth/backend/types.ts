// The booth backend: exactly the ApiClient operations (src/api/types.ts) plus the export for the offline verifier page.
// Two hosts run the same implementation (backend.ts): the Node server behind HTTP + SSE (server/compose.ts) and the
// on-device client in the browser (src/api/local). Nothing here may import node:*; the hosts inject what differs.
import type { MandateCredential } from "@laisee/core/generated";
import type { Checkpoint } from "@laisee/core/ports";
import type {
  AlternativesRequest,
  ApiInfo,
  AskRequest,
  BoothSnapshot,
  CompileResult,
  CompileRulesRequest,
  EscalationAnswerRequest,
  FamilySummary,
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
} from "../../api/types";

/** data/public-keys.json shape, for the keys the backend signs with right now. */
export interface PublicKeysView {
  readonly note: string;
  readonly engine: readonly string[];
  readonly delegator: string;
  readonly agent: string;
  /** A family budget: Mum's did:key (the issuer of the parent credential). */
  readonly parent?: string;
}

/** GET /api/export: everything the offline verifier page needs, pasted in as text. */
export interface ExportView {
  /** The stored log as JSONL (one JCS line per entry). Never the tampered copy. */
  readonly log: string;
  readonly publicKeys: PublicKeysView;
  readonly checkpoint: Checkpoint | null;
  /** A family budget: Mum's credential, for inspection as parent-credential.json. It is not in the log (see parentNote). */
  readonly parentCredential?: MandateCredential;
  readonly parentNote?: string;
}

export interface BoothBackend {
  info(): Promise<ApiInfo>;
  snapshot(): Promise<BoothSnapshot>;
  seal(req: SealRequest): Promise<SealResult>;
  runScenario(id: ScenarioId): Promise<RunSummary>;
  propose(req: ProposeRequest): Promise<RunSummary>;
  revoke(req: { readonly reason?: string }): Promise<RevokeResult>;
  answerEscalation(req: EscalationAnswerRequest): Promise<RunSummary>;
  ask(req: AskRequest): Promise<RunSummary>;
  suggestAlternatives(req: AlternativesRequest): Promise<RunSummary>;
  compileRules(req: CompileRulesRequest): Promise<CompileResult>;
  getLog(): Promise<LogView>;
  verify(): Promise<VerifyOutcome>;
  tamper(): Promise<LogView>;
  restore(): Promise<LogView>;
  reset(): Promise<void>;
  exportLog(): Promise<ExportView>;
  /** Mum's budget for a family seal; makes her (SIMULATED) credential on first use. Refused when features.family is off. */
  family(): Promise<FamilySummary>;
  subscribe(listener: TraceListener): Unsubscribe;
}

/** Where the backend reports problems that do not fail a request (tick errors, a card the rail could not void). */
export interface BackendLogger {
  info(message: string): void;
  error(message: string): void;
}

export const SILENT_BACKEND_LOGGER: BackendLogger = { info: () => undefined, error: () => undefined };
