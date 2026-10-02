// Orchestrator contract (A-26, A-23, A-24, A-25; docs/00 Pipeline contract v0, docs/02 section 2). One instance
// runs one packet (one sealed mandate). Every dependency is injected; the orchestrator holds the engine Signer and
// never the delegator's private key: seal, revoke and escalation answers arrive signed and are verified here.
// The log is the only state: the packet, cards and escalations are folded from it before every step.
import type { InvalidCartCode, ScameterLookup } from "../cart/types";
import type { CardRecord, Cart, Decision, ListingRecord, LogEntry, Mandate, PacketState } from "../generated";
import type { Executor, ExecutorAnomaly, ExecutorErrorReason } from "../executor/types";
import type {
  AppendEntry,
  CardEvent,
  Checkpoint,
  Clock,
  Engine,
  JudgePort,
  JudgeRecord,
  LogStore,
  MerchantPort,
  MintErrorCode,
  PlannerPort,
  PlannerTraceStep,
  RailPort,
  Signer,
  TemplateId,
} from "../ports";

// ---------- Dependencies ----------

/**
 * Builds a planner over one listing set. The rule planner takes its catalogue at construction, so the
 * orchestrator builds a fresh planner per submit. It receives listing records only: no key, handle, log or rail (I4).
 */
export type PlannerFactory = (listings: readonly ListingRecord[]) => PlannerPort;

export interface OrchestratorIds {
  /** Cart id, ^crt_[A-Za-z0-9]{6,40}$. */
  cartId(): string;
  /** Correlation id for the events of one operation (the server maps it to a booth scenario). */
  runId(): string;
}

/** Timeouts and TTL. Defaults come from ENGINE_CONFIG, each with its register row. */
export interface OrchestratorConfig {
  /** Planner timeout [F33]. */
  readonly plannerTimeoutMs: number;
  /** Judge call timeout [F34]; past it the judge record is TIMEOUT and R10 escalates (I5). */
  readonly judgeTimeoutMs: number;
  /** Card TTL asked of the rail at mint [F30]; the rail also clamps it to the packet expiry. */
  readonly cardTtlMs: number;
}

export interface OrchestratorDeps {
  /** Policy engine, including decideCheckout (R12). The only producer of a Decision. */
  readonly engine: Engine;
  readonly planner: PlannerFactory;
  readonly judge: JudgePort;
  /** SIMULATED rail. Use one rail per orchestrator: expireDue reports every due card on the rail. */
  readonly rail: RailPort;
  /** SIMULATED merchant stub; its mode (honest, overshoot, drift, ...) is its own business. */
  readonly merchant: MerchantPort;
  readonly store: LogStore;
  /** Engine (operator) key that signs log entries. */
  readonly signer: Signer;
  readonly clock: Clock;
  readonly ids: OrchestratorIds;
  /** Scameter capture lookup for the cart builder. */
  readonly scameter: ScameterLookup;
  readonly appendEntry: AppendEntry;
  /** Default: createExecutor from merchant, rail, store, signer, appendEntry and clock. */
  readonly executor?: Executor;
  readonly config?: Partial<OrchestratorConfig>;
  /** When set, seal refuses a credential from any other issuer (did:key of the delegator). */
  readonly delegatorDid?: string;
}

// ---------- Views (no card handle: it never leaves the orchestrator except inside log entries) ----------

/** CardRecord without the rail handle, with the state folded from the log. */
export type CardView = Omit<CardRecord, "handle">;

/** Same shape as the UI's EscalationView (apps/web/src/api/types.ts). */
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

export interface OrchestratorSnapshot {
  /** Domain view of the sealed credential; null before seal. */
  readonly mandate: Mandate | null;
  /** Folded at snapshot time; null before seal. */
  readonly packet: PacketState | null;
  readonly cards: readonly CardView[];
  /** Every escalation in the log, open and closed, oldest first. */
  readonly escalations: readonly EscalationView[];
  readonly log: readonly LogEntry[];
  readonly head: Checkpoint | null;
}

// ---------- Requests ----------

export type CheckoutMode = "auto" | "none";

export interface SubmitRequest {
  /** The shopper's request (what to buy). Untrusted; the planner gets it as intentText. */
  readonly requestText: string;
  /** Structured listing records: the planner chooses among them, the cart builder prices from them. */
  readonly listings: readonly ListingRecord[];
  /** After an APPROVE mint: "auto" runs one checkout at once. Default "none" (the server decides). */
  readonly checkout?: CheckoutMode;
  /** Correlation id; default ids.runId(). */
  readonly runId?: string;
}

export interface CheckoutRequest {
  readonly cardId: string;
  /** Stable key for this attempt; default derived by the executor (chk:<card id>:<n>). */
  readonly idempotencyKey?: string;
  readonly runId?: string;
}

export interface OperationOptions {
  readonly runId?: string;
}

export interface AnswerOptions extends OperationOptions {
  readonly checkout?: CheckoutMode;
}

// ---------- Results ----------

export type OperationName = "seal" | "submit" | "answer" | "checkout" | "revoke" | "tick";

export type OrchestratorErrorCode =
  | "NOT_SEALED"
  | "ALREADY_SEALED"
  | "LOG_EXISTS"
  | "INVALID_CREDENTIAL"
  | "INVALID_REQUEST"
  | "INVALID_ANSWER"
  | "INVALID_REVOCATION"
  | "UNKNOWN_ESCALATION"
  | "UNKNOWN_CARD"
  | "LOG_UNAVAILABLE"
  | "LOG_APPEND_FAILED"
  | "ENGINE_FAILED"
  | "DUPLICATE_DECISION"
  | "MINT_REFUSED"
  | "MINT_FAILED"
  | "CHECKOUT_FAILED"
  | "INTERNAL";

/** The operation failed closed: no mint happened after the failure (I5). */
export interface OperationFailure {
  readonly ok: false;
  readonly runId: string;
  readonly code: OrchestratorErrorCode;
  readonly message: string;
  /** Set when a Decision was already logged before the failure (it stays in the log, I7). */
  readonly decision?: Decision;
  /** MINT_REFUSED: the rail's MintError code; no card exists. */
  readonly mintError?: MintErrorCode;
  /** CHECKOUT_FAILED: the executor's reason. */
  readonly executorReason?: ExecutorErrorReason;
}

export interface SealSuccess {
  readonly ok: true;
  readonly runId: string;
  readonly mandate: Mandate;
  readonly packet: PacketState;
  readonly head: Checkpoint;
}

export type SealResult = SealSuccess | OperationFailure;

export interface CheckoutSettledResult {
  readonly ok: true;
  readonly runId: string;
  readonly status: "AUTHORISED" | "DECLINED";
  readonly cardId: string;
  readonly event: CardEvent;
  readonly attempts: number;
  readonly idempotencyKey: string;
  readonly anomalies: readonly ExecutorAnomaly[];
}

/** R12: the re-quote moved. The engine's DENY is logged and the card voided; nothing was charged. */
export interface CheckoutDriftResult {
  readonly ok: true;
  readonly runId: string;
  readonly status: "DRIFT";
  readonly cardId: string;
  readonly decision: Decision;
  readonly voided: boolean;
  readonly approvedTotalMinor: number;
  readonly quotedTotalMinor: number;
}

/** Every merchant call timed out; re-run with the same key to learn whether the charge landed. */
export interface CheckoutTimeoutResult {
  readonly ok: true;
  readonly runId: string;
  readonly status: "TIMEOUT";
  readonly cardId: string;
  readonly attempts: number;
  readonly idempotencyKey: string;
}

export type CheckoutResult = CheckoutSettledResult | CheckoutDriftResult | CheckoutTimeoutResult | OperationFailure;

/** engine.decide ran and its Decision is in the log. */
export interface DecidedResult {
  readonly ok: true;
  readonly runId: string;
  readonly outcome: Decision["outcome"];
  readonly decision: Decision;
  /** APPROVE: the minted card (no handle). */
  readonly card: CardView | null;
  /** ESCALATE: the open escalation; a resolving decision: the closed one. */
  readonly escalation: EscalationView | null;
  /** checkout "auto" after a mint. */
  readonly checkout: CheckoutResult | null;
}

export type NoProposalReason = "planner_null" | "planner_timeout" | "planner_error";

export interface NoProposalResult {
  readonly ok: true;
  readonly runId: string;
  readonly outcome: "NO_PROPOSAL";
  readonly reason: NoProposalReason;
}

export interface InvalidCartResult {
  readonly ok: true;
  readonly runId: string;
  readonly outcome: "INVALID_CART";
  readonly code: InvalidCartCode;
  readonly detail: string;
}

export type SubmitResult = DecidedResult | NoProposalResult | InvalidCartResult | OperationFailure;

export type AnswerResult = DecidedResult | OperationFailure;

export interface RevokeSuccess {
  readonly ok: true;
  readonly runId: string;
  readonly revokedAt: string;
  readonly voidedCardIds: readonly string[];
  /** ACTIVE cards the rail could not void (they stay chargeable until TTL; reported, never hidden). */
  readonly failedCardIds: readonly string[];
  /** The log already held a MANDATE_REVOKED; nothing new was appended. */
  readonly alreadyRevoked: boolean;
}

export type RevokeResult = RevokeSuccess | OperationFailure;

export interface TickProblem {
  readonly code: OrchestratorErrorCode;
  readonly message: string;
}

export interface TickResult {
  /** false when any step below failed (see problems); the rest still ran. */
  readonly ok: boolean;
  /** Set when the tick had work to do (its events carry this id). */
  readonly runId: string | null;
  /** ESCALATE decision ids resolved by R11 in this tick. */
  readonly expiredEscalations: readonly string[];
  readonly expiredCardIds: readonly string[];
  /** PACKET_EXPIRED was appended in this tick. */
  readonly packetExpired: boolean;
  readonly problems: readonly TickProblem[];
}

// ---------- Events (map almost 1:1 to the UI's TraceEvent; see the lane report for the differences) ----------

export type Stage = "planner" | "judge" | "engine" | "rail";
export type StageStatus = "running" | "done" | "error" | "skipped";
/** Same values as the UI's RunOutcome; `code` on run.finished carries the precise result. */
export type RunOutcome = "APPROVE" | "DENY" | "ESCALATE" | "INFO" | "ERROR";
export type CardEventCause = "checkout" | "void" | "expire";

export type OrchestratorEvent =
  | { readonly type: "mandate.sealed"; readonly runId: string; readonly mandate: Mandate; readonly packet: PacketState; readonly at: string }
  | { readonly type: "mandate.revoked"; readonly runId: string; readonly at: string; readonly voidedCardIds: readonly string[] }
  | { readonly type: "run.started"; readonly runId: string; readonly operation: OperationName; readonly at: string }
  | {
      readonly type: "stage";
      readonly runId: string;
      readonly stage: Stage;
      readonly status: StageStatus;
      readonly note?: string;
      readonly latencyMs?: number;
      readonly at: string;
    }
  | { readonly type: "planner.step"; readonly runId: string; readonly step: PlannerTraceStep; readonly at: string }
  | { readonly type: "cart"; readonly runId: string; readonly cart: Cart; readonly listingText: string; readonly plannerNote?: string }
  | { readonly type: "judge"; readonly runId: string; readonly judge: JudgeRecord }
  | { readonly type: "decision"; readonly runId: string; readonly decision: Decision }
  | { readonly type: "card.minted"; readonly runId: string; readonly card: CardView }
  | { readonly type: "card.event"; readonly runId: string; readonly event: CardEvent; readonly cause: CardEventCause; readonly attempts?: number }
  | { readonly type: "log"; readonly entry: LogEntry }
  | { readonly type: "checkpoint"; readonly head: Checkpoint }
  | { readonly type: "packet"; readonly packet: PacketState }
  | { readonly type: "escalation"; readonly escalation: EscalationView }
  | {
      readonly type: "error";
      readonly runId: string;
      readonly operation: OperationName;
      readonly code: OrchestratorErrorCode;
      readonly message: string;
      readonly at: string;
    }
  | {
      readonly type: "run.finished";
      readonly runId: string;
      readonly operation: OperationName;
      readonly outcome: RunOutcome;
      readonly code?: string;
      readonly note?: string;
      readonly at: string;
    };

export type OrchestratorListener = (event: OrchestratorEvent) => void;
export type Unsubscribe = () => void;

// ---------- The orchestrator ----------

export interface Orchestrator {
  /** Verify the credential (R1), append MANDATE_SEALED, publish the head checkpoint. Invalid proof: nothing logged. */
  seal(credential: unknown): Promise<SealResult>;
  /** Planner -> cart builder -> judge || fold -> decide -> DECISION -> mint -> CARD_MINTED (APPROVE only). */
  submit(request: SubmitRequest): Promise<SubmitResult>;
  /** Executor checkout of one card; callable repeatedly (DM2: overshoot decline, exact charge, replay CARD_USED). */
  checkout(request: CheckoutRequest): Promise<CheckoutResult>;
  /** Verify a signed escalation answer, decide the resolution, append it; an APPROVE mints. */
  answerEscalation(signedAnswer: unknown, options?: AnswerOptions): Promise<AnswerResult>;
  /** Verify a signed revocation, append MANDATE_REVOKED, void every ACTIVE card. */
  revoke(signedRevocation: unknown, options?: OperationOptions): Promise<RevokeResult>;
  /** R11 for escalations past their window, card expiry, PACKET_EXPIRED once. Call on a timer and before requests. */
  tick(): Promise<TickResult>;
  snapshot(): Promise<OrchestratorSnapshot>;
  /** Events in order; a throwing listener never breaks the pipeline. */
  subscribe(listener: OrchestratorListener): Unsubscribe;
}
