// Ports owned by core (docs/02 section 18, CONTRACT V2). agent and rail-sim implement them;
// apps/web composes them. Types only, plus MintError, the one error a RailPort may throw.
import type {
  CardRecord,
  Cart,
  Decision,
  JudgeProvider,
  LogEntry,
  LogEntryKind,
  LogPayloadByKind,
  Mandate,
  ProposeCartInput,
} from "./generated";

export type { ProposeCartInput } from "./generated";

export type JudgeRecord = Decision["judge"];
export type EscalationAnswer = NonNullable<NonNullable<Decision["escalation"]>["answer"]>;
export type CardEvent = Extract<LogEntry, { kind: "CARD_EVENT" }>["payload"];
export type TemplateId = NonNullable<Decision["explanation"]>["template_id"];
export type Checkpoint = { readonly log_id: string; readonly seq: number; readonly entry_hash: string };

export interface Clock {
  now(): Date;
}

/** Ed25519 signer. did = did:key of the public key; the private key never leaves the implementation. */
export interface Signer {
  readonly did: string;
  sign(message: Uint8Array): Uint8Array;
}

// ---------- Planner (untrusted, I4: no keys, no card handle, no log, no rail) ----------

export interface PlannerListing {
  readonly url: string;
  /** Listing text, untrusted data. Backends put it in a delimited block, never in instructions. */
  readonly text: string;
}

export interface PlannerContext {
  readonly intentText: string;
  readonly listings: readonly PlannerListing[];
}

/** Why the last proposal stopped, for planner.alternatives (R3/R4 budget stops only). */
export interface PlannerStop {
  readonly templateId: TemplateId;
  readonly remainingMinor: number;
}

/** PLANNER_PROVIDER: rule (default, deterministic parser), replay (recorded fixtures), local (Qwen on this Mac), claude (optional). */
export type PlannerProvider = "rule" | "replay" | "local" | "claude";

/** One typed planner decision (question asked of the judge model, its answer and probabilities). */
export interface PlannerTraceStep {
  readonly step: number;
  readonly question: string;
  readonly choice: string;
  readonly probabilities: Readonly<Record<string, number>>;
  /** Gap between the top two probabilities; a small margin makes the planner ask the shopper instead. */
  readonly margin: number;
  /** typed: a probability-bearing choice (Laya); generative: one constrained LLM answer, no probabilities (margin 0). */
  readonly source?: "typed" | "generative";
  /** Model call time for this step, when measured. */
  readonly latencyMs?: number;
}

export interface PlannerOptions {
  readonly timeoutMs: number;
  /** Called once per typed decision so the caller can log why the planner chose what it chose. */
  readonly onTrace?: (step: PlannerTraceStep) => void;
}

export interface PlannerPort {
  /** null = no proposal (refusal, abstention, invalid input, timeout). Never throws. */
  propose(ctx: PlannerContext, opts: PlannerOptions): Promise<ProposeCartInput | null>;
  /** Optional: a cheaper pick from the same listing set after a budget stop (R3/R4). Still only a proposal. */
  alternatives?(ctx: PlannerContext, stop: PlannerStop, opts: PlannerOptions): Promise<ProposeCartInput | null>;
}

// ---------- Judge (typed probabilistic gate; can only tighten, I3) ----------

export interface JudgeInput {
  readonly intentText: string;
  readonly rules: Mandate["rules"];
  readonly cart: Cart;
  readonly listingText: string;
  readonly scameter: Cart["scameter"];
}

export interface JudgePort {
  readonly provider: JudgeProvider;
  /** Never throws: failures return status TIMEOUT or ERROR, which R10 turns into ESCALATE (I5). */
  assess(input: JudgeInput, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<JudgeRecord>;
}

// ---------- Rail (SIMULATED) ----------

export type MintErrorCode = "NOT_APPROVED" | "ALREADY_MINTED" | "OVER_CEILING" | "MAX_ACTIVE" | "TTL_TOO_LONG";

export class MintError extends Error {
  readonly code: MintErrorCode;
  constructor(code: MintErrorCode, message?: string) {
    super(message ?? code);
    this.name = "MintError";
    this.code = code;
  }
}

export interface MintRequest {
  readonly decision: Decision;
  readonly ttlMs: number;
  readonly now: Date;
  /** SIMULATED merchant lock (domain); authorise from another domain declines MERCHANT_MISMATCH. */
  readonly merchantLock?: string;
  /** Cart or order reference, at most 80 chars (card-record.schema.json). */
  readonly purpose?: string;
}

export interface AuthoriseRequest {
  readonly handle: string;
  readonly amountMinor: number;
  readonly merchantDomain: string;
  readonly now: Date;
  /** Same key on a retry => the same CardEvent and never a second charge. */
  readonly idempotencyKey: string;
}

export interface RailPort {
  /**
   * Single-use card, limit = decision.approved_limit_minor (I2). Idempotent by decision.id: a repeat
   * mint for the same decision returns the same CardRecord and mints nothing new; ALREADY_MINTED is
   * thrown only when the repeat asks for different terms. Throws MintError otherwise (NOT_APPROVED, ...).
   */
  mint(req: MintRequest): Promise<CardRecord>;
  /** Declines are events, not errors: OVER_LIMIT, CARD_USED, CARD_VOIDED, CARD_EXPIRED, UNKNOWN_HANDLE, MERCHANT_MISMATCH. */
  authorise(req: AuthoriseRequest): Promise<CardEvent>;
  /** ACTIVE cards only; a used card is final [F2]. */
  void(cardId: string, now: Date): Promise<CardEvent>;
  expireDue(now: Date): Promise<CardEvent[]>;
}

// ---------- Merchant (SIMULATED stub in rail-sim; core never imports rail-sim) ----------

export interface MerchantQuote {
  readonly total_minor: number;
  readonly subtotal_minor: number;
  readonly shipping_minor: number;
  readonly fees_minor: number;
  readonly fx_minor: number;
}

export interface MerchantPort {
  /** Checkout re-quote (R12): any difference from the approved cart voids the approval. */
  quote(input: { cart: Cart; now: Date }): Promise<MerchantQuote>;
  /**
   * Presents the card handle; the merchant calls RailPort.authorise itself. May throw on a simulated
   * timeout: the executor retries with the same idempotencyKey and the rail charges at most once.
   */
  checkout(input: { cart: Cart; handle: string; idempotencyKey: string; now: Date }): Promise<CardEvent>;
}

// ---------- Log ----------

export interface LogStore {
  read(logId: string): Promise<readonly LogEntry[]>;
  head(logId: string): Promise<Checkpoint | null>;
  /** Append-only; rejects seq !== head.seq + 1 (seq 0 for an empty log). */
  append(entry: LogEntry): Promise<void>;
}

export type AppendEntry = <K extends LogEntryKind>(
  store: LogStore,
  signer: Signer,
  logId: string,
  kind: K,
  payload: LogPayloadByKind[K],
  now: Date,
) => Promise<LogEntry>;

// ---------- Engine, explanations, verifier (implemented by lane A) ----------

/** No answer and now >= expires_at => R11. */
export interface EscalationResolution {
  readonly resolves: string;
  readonly answer?: EscalationAnswer;
}

export type PacketState = Decision["packet"];

/** Facts the engine cannot compute itself without I/O; the caller supplies them. */
export interface DecideContext {
  /** Result of verifying the mandate credential's proof (R1). Absent means invalid: fail closed (I5). */
  readonly mandateProofValid?: boolean;
}

export interface Engine {
  /** Pure and total over schema-valid input; the only producer of a Decision. */
  decide(
    mandate: Mandate,
    packet: PacketState,
    cart: Cart,
    judge: JudgeRecord,
    now: Date,
    resolution?: EscalationResolution,
    ctx?: DecideContext,
  ): Decision;
}

export type FoldPacket = (entries: readonly LogEntry[], now: Date) => PacketState;
export type Render = (templateId: TemplateId, inputs: Readonly<Record<string, unknown>>, locale: "en" | "zh-HK") => string;

export type VerifyFailure =
  | "SCHEMA"
  | "SEQ"
  | "PREV_HASH"
  | "PAYLOAD_HASH"
  | "ENTRY_HASH"
  | "SIGNATURE"
  | "PAYLOAD_SIGNATURE"
  | "TRUNCATED";
export type VerifyResult =
  | { readonly ok: true; readonly head: Checkpoint }
  | { readonly ok: false; readonly failedSeq: number; readonly reason: VerifyFailure };
export type VerifyChain = (
  entries: readonly unknown[],
  publicKeys: { readonly engine: readonly string[]; readonly delegator: string },
  headCheckpoint?: Checkpoint,
) => VerifyResult;
