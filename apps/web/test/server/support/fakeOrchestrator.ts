// Scripted FakeOrchestrator (tests only, until lane e-orch merges): implements the Orchestrator contract with canned
// outcomes per listing id and records every call, so the runner, the event mapping and the backend can be tested.
// It does no policy work; objects it emits are shaped like the contract's, cast where a full Decision is not needed.
import type { CardRecord, Cart, Decision, Mandate, PacketState } from "@laisee/core/generated";
import type {
  CardView,
  CheckoutRequest,
  CheckoutResult,
  EscalationView,
  Orchestrator,
  OrchestratorDeps,
  OrchestratorEvent,
  OrchestratorListener,
  OrchestratorSnapshot,
  SubmitRequest,
  SubmitResult,
} from "@laisee/core/orchestrator";
import type { CardEvent, JudgeRecord } from "@laisee/core/ports";
import { mandateFromCredential } from "@laisee/core/vc";
import type { MandateCredential } from "@laisee/core/generated";

export type Scripted = { readonly outcome: "APPROVE" | "DENY" | "ESCALATE"; readonly templateId?: string };

export interface FakeCall {
  readonly op: "seal" | "submit" | "checkout" | "revoke" | "answer" | "tick";
  readonly runId?: string;
  readonly listingIds?: readonly string[];
  readonly requestText?: string;
  readonly cardId?: string;
  readonly mode?: string;
}

export const FAKE_HANDLE = "hdl_FAKEhandleFAKEhandleXYZ";
const AT = "2026-10-03T02:00:00Z";

export class FakeOrchestrator implements Orchestrator {
  readonly calls: FakeCall[] = [];
  readonly #deps: OrchestratorDeps;
  readonly #script: (listingIds: readonly string[]) => Scripted;
  #listeners: ReadonlySet<OrchestratorListener> = new Set();
  #mandate: Mandate | null = null;
  #cards: readonly CardView[] = [];
  #escalations: readonly EscalationView[] = [];
  #n = 0;

  constructor(deps: OrchestratorDeps, script: (listingIds: readonly string[]) => Scripted) {
    this.#deps = deps;
    this.#script = script;
  }

  subscribe(listener: OrchestratorListener): () => void {
    this.#listeners = new Set([...this.#listeners, listener]);
    return () => {
      this.#listeners = new Set([...this.#listeners].filter((l) => l !== listener));
    };
  }

  /** Emits as the real orchestrator would from a tick (tests use it to route R11 resolutions). */
  emit(event: OrchestratorEvent): void {
    for (const l of this.#listeners) l(event);
  }

  #id(prefix: string): string {
    this.#n += 1;
    const letters = "abcdefghijklmnopqrstuvwxyz";
    return `${prefix}_fakeid${letters.charAt(this.#n % 26)}${letters.charAt(Math.floor(this.#n / 26) % 26)}`;
  }

  #packet(): PacketState {
    return { remaining_minor: 80_000, budget_minor: 80_000, committed_minor: 0, spent_minor: 0 } as unknown as PacketState;
  }

  async seal(credential: unknown): Promise<Awaited<ReturnType<Orchestrator["seal"]>>> {
    this.calls.push({ op: "seal" });
    const mandate = mandateFromCredential(credential as MandateCredential);
    this.#mandate = mandate;
    const runId = this.#id("run");
    this.emit({ type: "run.started", runId, operation: "seal", at: AT });
    this.emit({ type: "mandate.sealed", runId, mandate, packet: this.#packet(), at: AT });
    this.emit({ type: "run.finished", runId, operation: "seal", outcome: "INFO", at: AT });
    return { ok: true, runId, mandate, packet: this.#packet(), head: { log_id: "log_fakeabcdef", seq: 0, entry_hash: "0".repeat(64) } };
  }

  async submit(req: SubmitRequest): Promise<SubmitResult> {
    const runId = req.runId ?? this.#id("run");
    const listingIds = req.listings.map((l) => l.id);
    this.calls.push({ op: "submit", runId, listingIds, requestText: req.requestText });
    const scripted = this.#script(listingIds);
    this.emit({ type: "run.started", runId, operation: "submit", at: AT });
    this.emit({ type: "stage", runId, stage: "planner", status: "running", at: AT });
    this.emit({ type: "planner.step", runId, step: { step: 1, question: "item_forced", choice: "cotton_tee", probabilities: { cotton_tee: 0.9, none: 0.1 }, margin: 0.8 }, at: AT });
    this.emit({ type: "stage", runId, stage: "planner", status: "done", latencyMs: 120, at: AT });
    const cart = { id: this.#id("crt"), total_minor: req.listings[0]?.items[0]?.unit_price_minor ?? 0, merchant: req.listings[0]?.merchant } as unknown as Cart;
    this.emit({ type: "cart", runId, cart, listingText: req.listings[0]?.text ?? "", plannerNote: "fake" });
    this.emit({ type: "judge", runId, judge: { provider: "replay", status: "OK" } as unknown as JudgeRecord });
    const decision = { id: this.#id("dec"), outcome: scripted.outcome, explanation: scripted.templateId ? { template_id: scripted.templateId } : undefined, cart } as unknown as Decision;
    this.emit({ type: "decision", runId, decision });
    let card: CardView | null = null;
    if (scripted.outcome === "APPROVE") {
      const record = { id: this.#id("crd"), decision_id: decision.id, handle: FAKE_HANDLE, last4: "4242", limit_minor: cart.total_minor, state: "ACTIVE" } as unknown as CardRecord;
      const { handle: _handle, ...view } = record;
      card = view;
      this.#cards = [...this.#cards, view];
      this.emit({ type: "card.minted", runId, card: view });
    }
    if (scripted.outcome === "ESCALATE") {
      const esc = { decisionId: decision.id, templateId: scripted.templateId, ruleId: "R9", state: "OPEN", openedAt: AT, expiresAt: AT, totalMinor: cart.total_minor, merchantName: "x" } as unknown as EscalationView;
      this.#escalations = [...this.#escalations, esc];
      this.emit({ type: "escalation", escalation: esc });
    }
    this.emit({ type: "run.finished", runId, operation: "submit", outcome: scripted.outcome, at: AT });
    return { ok: true, runId, outcome: scripted.outcome, decision, card, escalation: null, checkout: null };
  }

  #event(cardId: string, event: string, code?: string): CardEvent {
    return { card_id: cardId, event, ...(code ? { decline_code: code } : {}), at: AT } as unknown as CardEvent;
  }

  #setState(cardId: string, state: CardView["state"]): void {
    this.#cards = this.#cards.map((c) => (c.id === cardId ? { ...c, state } : c));
  }

  async checkout(req: CheckoutRequest): Promise<CheckoutResult> {
    const runId = req.runId ?? this.#id("run");
    const mode = (this.#deps.merchant as unknown as { mode: string }).mode;
    this.calls.push({ op: "checkout", runId, cardId: req.cardId, mode });
    const card = this.#cards.find((c) => c.id === req.cardId);
    if (card === undefined) return { ok: false, runId, code: "UNKNOWN_CARD", message: "no such card" };
    if (mode === "drift") {
      const decision = { id: this.#id("dec"), outcome: "DENY", resolves: card.decision_id, explanation: { template_id: "R12.price_drift" } } as unknown as Decision;
      this.emit({ type: "decision", runId, decision });
      this.#setState(card.id, "VOIDED");
      this.emit({ type: "card.event", runId, event: this.#event(card.id, "VOIDED"), cause: "void" });
      return { ok: true, runId, status: "DRIFT", cardId: card.id, decision, voided: true, approvedTotalMinor: 1, quotedTotalMinor: 2 };
    }
    const declined = mode === "overshoot" ? "OVER_LIMIT" : mode === "wrong_merchant" ? "MERCHANT_MISMATCH" : card.state === "USED" ? "CARD_USED" : null;
    const event = declined ? this.#event(card.id, "DECLINED", declined) : this.#event(card.id, "AUTHORISED");
    if (!declined) this.#setState(card.id, "USED");
    const attempts = mode === "timeout" ? 2 : 1;
    this.emit({ type: "card.event", runId, event, cause: "checkout", attempts });
    return { ok: true, runId, status: declined ? "DECLINED" : "AUTHORISED", cardId: card.id, event, attempts, idempotencyKey: `chk:${card.id}:1`, anomalies: [] };
  }

  async answerEscalation(): Promise<Awaited<ReturnType<Orchestrator["answerEscalation"]>>> {
    this.calls.push({ op: "answer" });
    return { ok: false, runId: "run_none", code: "UNKNOWN_ESCALATION", message: "not open" };
  }

  async revoke(): Promise<Awaited<ReturnType<Orchestrator["revoke"]>>> {
    this.calls.push({ op: "revoke" });
    const active = this.#cards.filter((c) => c.state === "ACTIVE").map((c) => c.id);
    for (const id of active) this.#setState(id, "VOIDED");
    return { ok: true, runId: "run_revoke", revokedAt: AT, voidedCardIds: active, failedCardIds: [], alreadyRevoked: false };
  }

  async tick(): Promise<Awaited<ReturnType<Orchestrator["tick"]>>> {
    this.calls.push({ op: "tick" });
    return { ok: true, runId: null, expiredEscalations: [], expiredCardIds: [], packetExpired: false, problems: [] };
  }

  async snapshot(): Promise<OrchestratorSnapshot> {
    return { mandate: this.#mandate, packet: this.#mandate ? this.#packet() : null, cards: this.#cards, escalations: this.#escalations, log: [], head: this.#mandate ? { log_id: "log_fakeabcdef", seq: 0, entry_hash: "0".repeat(64) } : null };
  }
}
