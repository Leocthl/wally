// ApiClient: the one boundary between the UI and the engine side (docs/02 section 18, lane C brief).
// MockApiClient replays the SIMULATED storyline offline; an HTTP + SSE client implements the same interface later.
import type { CardRecord, Cart, CompiledRules, Decision, LogEntry, Mandate, PacketState } from "@laisee/core/generated";
import type { CardEvent, Checkpoint, JudgeRecord, TemplateId, VerifyFailure, VerifyResult } from "@laisee/core/ports";

export type { CardEvent, CardRecord, Cart, CompiledRules, Decision, JudgeRecord, LogEntry, Mandate, PacketState, TemplateId };

/** Presets a judge can press at the booth, plus the steps the presenter walks (mint, pay). */
export const SCENARIO_IDS = [
  "normal",
  "small",
  "mint",
  "pay",
  "overshoot",
  "flagged",
  "overflow",
  "injected",
  "unverified",
  "revoke",
  "replay",
  "wrong_merchant",
  "drift",
  "timeout",
  "off_category",
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export type Stage = "planner" | "judge" | "engine" | "rail";
export type StageStatus = "running" | "done" | "error" | "skipped";

/** What happened to a card at checkout, for the DM2 beats. */
export type CardBeat = "overshoot" | "exact" | "replay" | "wrong_merchant" | "retry" | "void" | "expire";

export type RunOutcome = "APPROVE" | "DENY" | "ESCALATE" | "INFO" | "ERROR";

export interface PlannerTraceInfo {
  readonly provider: "rule" | "replay";
  readonly choice?: string;
  readonly probabilities?: Readonly<Record<string, number>>;
  readonly latencyMs?: number;
}

export interface EscalationView {
  readonly decisionId: string;
  readonly templateId: TemplateId;
  readonly ruleId: string;
  readonly state: "OPEN" | "APPROVED" | "DENIED" | "EXPIRED";
  readonly openedAt: string;
  readonly expiresAt: string;
  readonly totalMinor: number;
  readonly merchantName: string;
}

export type TraceEvent =
  | { readonly type: "reset"; readonly at: string }
  | { readonly type: "mandate.sealed"; readonly mandate: Mandate; readonly packet: PacketState; readonly at: string }
  | { readonly type: "mandate.revoked"; readonly at: string; readonly voidedCardIds: readonly string[] }
  | { readonly type: "run.started"; readonly runId: string; readonly scenario: ScenarioId | "custom"; readonly at: string }
  | { readonly type: "stage"; readonly runId: string; readonly stage: Stage; readonly status: StageStatus; readonly note?: string; readonly latencyMs?: number; readonly at: string }
  | { readonly type: "cart"; readonly runId: string; readonly cart: Cart; readonly listingText: string; readonly plannerNote?: string; readonly planner?: PlannerTraceInfo }
  | { readonly type: "judge"; readonly runId: string; readonly judge: JudgeRecord }
  | { readonly type: "decision"; readonly runId: string; readonly decision: Decision }
  | { readonly type: "card.minted"; readonly runId: string; readonly card: CardRecord }
  | { readonly type: "card.event"; readonly runId: string; readonly event: CardEvent; readonly beat: CardBeat }
  | { readonly type: "log"; readonly entry: LogEntry }
  | { readonly type: "packet"; readonly packet: PacketState }
  | { readonly type: "escalation"; readonly escalation: EscalationView }
  | { readonly type: "run.finished"; readonly runId: string; readonly outcome: RunOutcome; readonly at: string; readonly note?: string };

export type Unsubscribe = () => void;
export type TraceListener = (event: TraceEvent) => void;

export interface SealRequest {
  readonly intentText: string;
  readonly rules: CompiledRules;
  /** RFC 3339 UTC. The credential's validUntil. */
  readonly validUntil: string;
}

export interface SealResult {
  readonly mandate: Mandate;
  readonly packet: PacketState;
  readonly head: Checkpoint;
}

export interface ProposeRequest {
  /** Free text the visitor wrote as a listing description ("Try to trick the agent"). Untrusted data. */
  readonly listingText: string;
}

export interface RunSummary {
  readonly runId: string;
  readonly scenario: ScenarioId | "custom";
  readonly outcome: RunOutcome;
  readonly decisionId?: string;
  readonly note?: string;
}

export interface RevokeResult {
  readonly revokedAt: string;
  readonly voidedCardIds: readonly string[];
}

export interface EscalationAnswerRequest {
  readonly decisionId: string;
  readonly choice: "APPROVE" | "DENY";
}

export interface LogView {
  readonly entries: readonly LogEntry[];
  readonly head: Checkpoint | null;
  /** Set while a tampered copy is shown: which entry changed and how. The stored log is untouched. */
  readonly tampered: null | { readonly seq: number; readonly field: string; readonly before: number; readonly after: number };
}

export interface VerifyOutcome {
  readonly result: VerifyResult;
  readonly checked: readonly VerifyFailure[];
  /** Checks this client cannot run. The mock cannot verify Ed25519 signatures. */
  readonly skipped: readonly VerifyFailure[];
  readonly at: string;
}

export interface RealCapture {
  readonly capturedAt: string;
  readonly declineCode: string;
  readonly note: string;
}

export interface ApiInfo {
  readonly kind: "mock" | "http";
  readonly judge: { readonly provider: "replay" | "laya" | "jev"; readonly note: string };
  readonly planner: { readonly provider: "rule" | "replay"; readonly note: string };
  /** true when outputs are recorded, not live: the booth shows a "replayed" label (docs/06 Fallbacks). */
  readonly replayed: boolean;
  /** The one OBSERVED decline for the REAL toggle. null until data/real-card-test.md holds one. */
  readonly realCapture: RealCapture | null;
}

export interface BoothSnapshot {
  readonly mandate: Mandate | null;
  readonly intentText: string | null;
  readonly packet: PacketState | null;
  readonly cards: readonly CardRecord[];
  readonly log: LogView;
  readonly escalations: readonly EscalationView[];
}

export interface ApiClient {
  readonly kind: "mock" | "http";
  info(): Promise<ApiInfo>;
  snapshot(): Promise<BoothSnapshot>;
  seal(req: SealRequest): Promise<SealResult>;
  runScenario(id: ScenarioId): Promise<RunSummary>;
  propose(req: ProposeRequest): Promise<RunSummary>;
  revoke(req?: { readonly reason?: string }): Promise<RevokeResult>;
  answerEscalation(req: EscalationAnswerRequest): Promise<RunSummary>;
  getLog(): Promise<LogView>;
  verify(): Promise<VerifyOutcome>;
  tamper(): Promise<LogView>;
  restore(): Promise<LogView>;
  reset(): Promise<void>;
  subscribe(listener: TraceListener): Unsubscribe;
}
