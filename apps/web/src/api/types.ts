// ApiClient: the one boundary between the UI and the engine side (docs/02 section 18, lane C brief).
// HttpApiClient talks to the booth server (live mode); LocalApiClient runs the same real stack on the device with
// recorded model answers (on-device mode); MockApiClient is a UI-test double.
import type { CardRecord, Cart, CompiledRules, Decision, LogEntry, Mandate, MandateCredential, PacketState } from "@wally/core/generated";
import type { ParentSummary } from "@wally/core/family";
import type { CardEvent, Checkpoint, JudgeRecord, TemplateId, VerifyFailure, VerifyResult } from "@wally/core/ports";
import type { Color, Fit, ImageMime, Kind, Pattern, PaletteEntry, ReasonId, Style } from "@wally/agent/vision";

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
  "family_ok",
  "family_over",
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export type Stage = "planner" | "judge" | "engine" | "rail";
export type StageStatus = "running" | "done" | "error" | "skipped";

/** What happened to a card at checkout, for the DM2 beats. */
export type CardBeat = "overshoot" | "exact" | "replay" | "wrong_merchant" | "retry" | "void" | "expire";

export type RunOutcome = "APPROVE" | "DENY" | "ESCALATE" | "INFO" | "ERROR";

export interface PlannerTraceInfo {
  readonly provider: "rule" | "replay" | "local";
  readonly choice?: string;
  readonly probabilities?: Readonly<Record<string, number>>;
  readonly latencyMs?: number;
}

export interface EscalationView {
  readonly decisionId: string;
  readonly templateId: TemplateId;
  readonly ruleId: string;
  /** CLOSED: nobody answered before the budget was cancelled or ended, so there is nothing left to answer. */
  readonly state: "OPEN" | "APPROVED" | "DENIED" | "EXPIRED" | "CLOSED";
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
  | {
      readonly type: "run.finished";
      readonly runId: string;
      readonly outcome: RunOutcome;
      readonly at: string;
      readonly note?: string;
      /** Same as RunSummary.code. */
      readonly code?: string;
      /** Same as RunSummary.duplicate, with the earlier decision's id: nothing new was decided, minted or charged. */
      readonly duplicateOf?: string;
    };

export type Unsubscribe = () => void;
export type TraceListener = (event: TraceEvent) => void;

/** Fund a budget from a parent's: the parent's ceiling caps it (caps compose). Only "mum" exists in the demo. */
export interface FamilySeal {
  readonly parent: "mum";
}

export interface SealRequest {
  readonly intentText: string;
  readonly rules: CompiledRules;
  /** RFC 3339 UTC. The credential's validUntil. */
  readonly validUntil: string;
  /**
   * Optional (check info().features.family). Present: the budget is Mei's share of Mum's, sealed only when it is inside
   * Mum's rules, otherwise refused with EXCEEDS_PARENT and details { field, requested, allowed }; nothing is sealed.
   */
  readonly family?: FamilySeal;
}

/**
 * Mum's budget as a family seal sees it. Money in integer minor units. ceilingMinor is the most one budget can take: a new
 * seal replaces the family budget held now and gives its share back. allocatedMinor is that held share (0 when the budget
 * held now is Mei's own); remainingMinor = ceilingMinor - allocatedMinor.
 */
export interface FamilySummary extends ParentSummary {
  readonly parent: "mum";
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
  /**
   * Stable reason for an INFO or ERROR (and for the two flags below), so a screen can word it in its own language:
   * DUPLICATE, NO_PROPOSAL:<reason>, INVALID_CART:<code>, ON_DEVICE_UNKNOWN_REQUEST, or an orchestrator error code.
   */
  readonly code?: string;
  /** The cart repeated a live one: this is the earlier decision, and nothing new was decided, minted or charged. */
  readonly duplicate?: true;
  /** ask-style runs: the stopped decision this run was a cheaper pick for (suggestAlternatives). */
  readonly alternativeTo?: string;
}

export interface AskRequest {
  /** What the shopper wants, in their own words. At most 1,000 characters after NFKC [F56]. Untrusted. */
  readonly requestText: string;
  readonly locale?: AskLocale;
  /**
   * Show Wally a photo: the photo-shelf item the shopper picked from the matches (see()). The planner's proposal is then fixed
   * by code, since the shopper chose the item; the judge, the rules and the one-off card work exactly as for any ask.
   */
  readonly listingId?: string;
}

/** The picture sent to see(): re-encoded by the page (JPEG, at most 1024 px, no metadata). base64 without the data: prefix. */
export interface SeeImage {
  readonly mime: ImageMime;
  readonly data: string;
}

/** What a picture, or the chips the shopper set, say about the item. Missing parts mean no preference. */
export interface SeeAttributes {
  readonly kind: Kind | null;
  /** Most dominant first, at most 3. */
  readonly colors: readonly Color[];
  readonly pattern: Pattern | null;
  readonly fit: Fit | null;
  /** At most 2. */
  readonly style: readonly Style[];
}

/**
 * Show Wally a picture, or tell Wally in words. One of: `image` (the local model reads it when features.see is "model",
 * then the colour plates are used), `attributes` (the shopper edited the chips: matches are rebuilt from them, nothing is
 * read) or `text` (the shopper's own words, read by fixed keyword tables in English or Traditional Chinese: no model, the
 * same answer on every host). `palette` is the dominant colours the page worked out from the pixels; it is the colour
 * source when no model reads the picture. `maxPriceMinor` rides with `attributes`: the price limit a typed request named,
 * kept while the chips change.
 */
export interface SeeRequest {
  readonly image?: SeeImage;
  readonly palette?: readonly PaletteEntry[];
  readonly attributes?: Partial<SeeAttributes>;
  readonly text?: string;
  readonly maxPriceMinor?: number;
}

/** One simulated shop item that looks like the picture. The screen words the name and the reasons in its own language. */
export interface ShopMatch {
  readonly listingId: string;
  readonly kind: Kind;
  readonly colors: readonly Color[];
  readonly pattern: Pattern;
  readonly fit: Fit;
  readonly style: readonly Style[];
  readonly merchantName: string;
  /** The item's price, and with shipping the total a card would be made for. Integer minor units, SIMULATED. */
  readonly priceMinor: number;
  readonly totalMinor: number;
  /** 0 to 100. */
  readonly score: number;
  readonly reasons: readonly ReasonId[];
}

export interface SeeResult {
  /** Where `attributes` came from: the local model read the picture, only the colour plates were used, the shopper's chips, or the shopper's words. */
  readonly source: "model" | "palette" | "chips" | "text";
  readonly attributes: SeeAttributes;
  readonly palette: readonly PaletteEntry[];
  /** The best four, best first. Empty when no kind is known yet (pick one on the chips), the shop has nothing like it, or nothing costs less than the limit. */
  readonly matches: readonly ShopMatch[];
  /** The price limit the matches respect (from the words, or kept from the chips), integer minor units; absent: none. */
  readonly maxPriceMinor?: number;
  /**
   * not_clothing: the model saw nothing to wear. model_failed: it was asked and could not answer (the chips still work).
   * nothing_found: the words named no kind the shop sells. not_sold: they named a product the shop does not sell (earbuds, a gift card).
   */
  readonly notice?: "not_clothing" | "model_failed" | "nothing_found" | "not_sold";
}

/** "See cheaper options": the decision a budget stop (R3, R4) gave. */
export interface AlternativesRequest {
  readonly decisionId: string;
}

export interface CompileRulesRequest {
  /** The sentence, at most 280 characters after NFKC (the mandate's intent text limit). */
  readonly text: string;
  readonly locale: AskLocale;
}

/** One chip label per rule, made in code from the validated rules. */
export interface CompileLabel {
  readonly kind: "budget" | "expiry" | "category" | "sellers" | "cap" | "askAbove" | "share" | "velocity";
  /** Rule the chip enforces (docs/02 section 7). */
  readonly rule: "R2" | "R3" | "R4" | "R6" | "R7" | "R9";
  readonly en: string;
  readonly zhHK: string;
}

/** A suggestion for the Seal screen. Never sealed by this call: the shopper edits and confirms the chips first. */
export interface CompileResult {
  readonly source: "model" | "rules";
  readonly rules: CompiledRules;
  /** mandate.valid_until, worked out in code from the clock. */
  readonly validUntil: string;
  readonly labels: readonly CompileLabel[];
  /** Plain sentences in the request's language: defaults applied, and why the fixed rules answered when the model did not. */
  readonly notes: readonly string[];
  /** What the sentence asked for that the suggestion does not carry, and why. */
  readonly clamped: readonly string[];
  readonly confirmRequired: true;
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

/** mock: UI-test double. http: the booth server (live mode). local: the real stack on this device, recorded answers. */
export type ApiKind = "mock" | "http" | "local";

/** Screen languages the typed-request and sentence-to-rules routes take. */
export type AskLocale = "en" | "zh-HK";

/** What this backend can do beyond the booth buttons; a screen shows a control only when its feature is on. */
export interface ApiFeatures {
  /** ask() works. On-device it answers the sample requests only; anything else is an INFO run saying so. */
  readonly ask: boolean;
  /** suggestAlternatives() can find a cheaper pick: the planner replans after a budget stop (R3, R4). */
  readonly alternatives: boolean;
  /** compileRules(): "model" = the local model reads the sentence, "rules" = the fixed rules parser. */
  readonly compile: "model" | "rules";
  /** Family budget: SealRequest.family and family() work, and the family_ok and family_over scenarios exist. Off hides the feature. */
  readonly family: boolean;
  /**
   * Show Wally a photo: "model" = the local model reads the picture into typed words, "palette" = only the colour plates and the
   * item-type chips (always works). Absent = "palette". The photo entry is offered either way when the client has see().
   */
  readonly see?: "model" | "palette";
}

export interface ApiInfo {
  readonly kind: ApiKind;
  readonly judge: { readonly provider: "replay" | "laya" | "jev"; readonly note: string };
  /** local = the Qwen model on this machine. The note says who chose it (the operator, or the start-up check). */
  readonly planner: { readonly provider: "rule" | "replay" | "local"; readonly note: string };
  readonly features: ApiFeatures;
  /** true when outputs are recorded, not live: the booth shows a "replayed" label (docs/06 Fallbacks). */
  readonly replayed: boolean;
  /** The one OBSERVED decline for the REAL toggle. null until data/real-card-test.md holds one. */
  readonly realCapture: RealCapture | null;
  /** On-device mode only: this page keeps the session in the browser's storage until the demo is started over (src/api/local/persist). Absent: it does not. */
  readonly remembers?: boolean;
}

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

export interface BoothSnapshot {
  readonly mandate: Mandate | null;
  readonly intentText: string | null;
  readonly packet: PacketState | null;
  readonly cards: readonly CardRecord[];
  readonly log: LogView;
  readonly escalations: readonly EscalationView[];
}

export interface ApiClient {
  readonly kind: ApiKind;
  info(): Promise<ApiInfo>;
  snapshot(): Promise<BoothSnapshot>;
  seal(req: SealRequest): Promise<SealResult>;
  runScenario(id: ScenarioId): Promise<RunSummary>;
  propose(req: ProposeRequest): Promise<RunSummary>;
  revoke(req?: { readonly reason?: string }): Promise<RevokeResult>;
  answerEscalation(req: EscalationAnswerRequest): Promise<RunSummary>;
  /** Ask Wally: a typed request goes through planner, judge, rules and (on APPROVE) a one-off SIMULATED card. Check info().features.ask. */
  ask?(req: AskRequest): Promise<RunSummary>;
  /** "See cheaper options" after a budget stop. Check info().features.alternatives. */
  suggestAlternatives?(req: AlternativesRequest): Promise<RunSummary>;
  /** Show Wally a photo: a picture (or the chips) in, a few typed words and four similar simulated shop items out. Reads, buys and seals nothing. */
  see?(req: SeeRequest): Promise<SeeResult>;
  /** Sentence to rule chips for the Seal screen; a suggestion only, never sealed here. */
  compileRules?(req: CompileRulesRequest): Promise<CompileResult>;
  /** The stored log and keys for the offline verifier (Receipts > Export). Offered by the booth server and the on-device client. */
  exportLog?(): Promise<ExportView>;
  /** Mum's budget (the ceiling a family seal is checked against). Check info().features.family. */
  family?(): Promise<FamilySummary>;
  getLog(): Promise<LogView>;
  verify(): Promise<VerifyOutcome>;
  tamper(): Promise<LogView>;
  restore(): Promise<LogView>;
  reset(): Promise<void>;
  subscribe(listener: TraceListener): Unsubscribe;
  /**
   * The live connection came back after a break (the booth restarted, or the phone lost the network). Events from the gap are not
   * replayed, so the page reads the booth again. Only a client with a live connection offers it (never fires on the first connect).
   */
  onReconnect?(listener: () => void): Unsubscribe;
}
