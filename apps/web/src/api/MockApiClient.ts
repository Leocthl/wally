// MockApiClient: replays the SIMULATED storyline offline (docs/01 Storyboard, docs/06 beats) with real packet math, so a
// judge can press anything in any order with no network and no key. Every output is SIMULATED and the UI says so.
// The HTTP + SSE client replaces this behind the same ApiClient interface; nothing in the UI knows which one it has.
import { formatIssues, validateMandate, validateMandateCredential } from "@laisee/core/schema";
import type { MandateCredential, Revocation } from "@laisee/core/generated";
import type { Clock } from "@laisee/core/ports";
import { mandateFromCredential } from "@laisee/core/vc";
import { PLACEHOLDER_SIGNATURE } from "@laisee/core/testing";
import type {
  ApiClient,
  ApiInfo,
  BoothSnapshot,
  EscalationAnswerRequest,
  LogView,
  ProposeRequest,
  RevokeResult,
  RunOutcome,
  RunSummary,
  ScenarioId,
  SealRequest,
  SealResult,
  TraceListener,
  Unsubscribe,
  VerifyOutcome,
} from "./types";
import { checkout, mintFor, proposeAndDecide, skipUpstream, type CheckoutMode, type Purchase, type PurchaseSpec } from "./mock/flows";
import { answerOpenEscalation, expireDueEscalations } from "./mock/escalation";
import { CHECKED, SKIPPED, tamperCopy, verifyMockChain } from "./mock/log";
import { M0_CREDENTIAL } from "./mock/fixtures";
import { m0SealRequest } from "./mock/presets";
import { customSpec, presetSpec, type PresetKey } from "./mock/scenarios";
import { MockSession } from "./mock/session";

export interface MockOptions {
  readonly clock?: Clock;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Multiplier for display pauses (1 = realistic, 0 = instant for tests). */
  readonly pace?: number;
  /** Milliseconds between escalation sweeps. Omit in tests and call sweepEscalations() yourself. */
  readonly sweepEveryMs?: number;
}

const SYSTEM_CLOCK: Clock = { now: () => new Date() };
const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type Body = (runId: string) => Promise<{ readonly outcome: RunOutcome; readonly decisionId?: string; readonly note?: string }>;

export class MockApiClient implements ApiClient {
  readonly kind = "mock" as const;
  readonly #s: MockSession;
  #queue: Promise<unknown> = Promise.resolve();
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: MockOptions = {}) {
    this.#s = new MockSession({ clock: opts.clock ?? SYSTEM_CLOCK, sleep: opts.sleep ?? realSleep, pace: opts.pace ?? 1 });
    if (opts.sweepEveryMs) this.#timer = setInterval(() => void this.sweepEscalations(), opts.sweepEveryMs);
  }

  dispose(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  subscribe(listener: TraceListener): Unsubscribe {
    return this.#s.subscribe(listener);
  }

  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(task, task);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  async info(): Promise<ApiInfo> {
    return {
      kind: "mock",
      judge: { provider: "replay", note: "Recorded answers (SIMULATED). Typed text goes to a keyword stand-in, not to Laya." },
      planner: { provider: "replay", note: "Recorded proposals (SIMULATED). Typed text uses the rule planner." },
      replayed: true,
      realCapture: null,
    };
  }

  async snapshot(): Promise<BoothSnapshot> {
    const s = this.#s;
    const mandate = s.mandate;
    return {
      mandate,
      intentText: s.intentText,
      packet: mandate ? s.packet() : null,
      cards: mandate ? s.cards() : [],
      log: this.#view(),
      escalations: [...s.escalations.values()].map((r) => r.view),
    };
  }

  #view(): LogView {
    const s = this.#s;
    const t = s.tamper;
    return {
      entries: t ? t.entries : s.entries,
      head: s.head(),
      tampered: t ? { seq: t.seq, field: t.field, before: t.before, after: t.after } : null,
    };
  }

  seal(req: SealRequest): Promise<SealResult> {
    return this.#enqueue(async () => this.#seal(req));
  }

  #seal(req: SealRequest): SealResult {
    const s = this.#s;
    const now = s.nowIso();
    const credential: MandateCredential = {
      ...M0_CREDENTIAL,
      id: s.nextId("mnd"),
      validFrom: now,
      validUntil: req.validUntil,
      credentialSubject: { ...M0_CREDENTIAL.credentialSubject, intent_text: req.intentText, rules: req.rules },
      proof: { ...M0_CREDENTIAL.proof, created: now },
    };
    const checked = validateMandateCredential(credential);
    if (!checked.ok) throw new Error(`mandate credential invalid: ${formatIssues(checked.errors)}`);
    const mandate = mandateFromCredential(credential);
    const view = validateMandate(mandate);
    if (!view.ok) throw new Error(`mandate invalid: ${formatIssues(view.errors)}`);
    s.begin(mandate, req.intentText, s.nextId("log"));
    s.append("MANDATE_SEALED", credential);
    const packet = s.packet();
    s.emit({ type: "mandate.sealed", mandate, packet, at: now });
    return { mandate, packet, head: s.head() ?? { log_id: "", seq: 0, entry_hash: "" } };
  }

  reset(): Promise<void> {
    return this.#enqueue(async () => {
      this.#s.emit({ type: "reset", at: this.#s.nowIso() });
      this.#seal(m0SealRequest(this.#s.now()));
    });
  }

  // ---------- runs ----------

  #run(scenario: ScenarioId | "custom", body: Body): Promise<RunSummary> {
    return this.#enqueue(async () => {
      const s = this.#s;
      const runId = s.nextId("run");
      s.emit({ type: "run.started", runId, scenario, at: s.nowIso() });
      try {
        const result = await body(runId);
        s.emit({ type: "run.finished", runId, outcome: result.outcome, at: s.nowIso(), ...(result.note ? { note: result.note } : {}) });
        return { runId, scenario, ...result };
      } catch (err) {
        // Fail closed (I5): no card, and the visitor sees why instead of a frozen screen.
        const note = err instanceof Error ? err.message : "unknown error";
        s.emit({ type: "run.finished", runId, outcome: "ERROR", at: s.nowIso(), note });
        return { runId, scenario, outcome: "ERROR", note };
      }
    });
  }

  /** Propose, decide, and mint on APPROVE. */
  async #mint(spec: PurchaseSpec): Promise<Purchase> {
    const purchase = await proposeAndDecide(this.#s, spec);
    return purchase.decision.outcome === "APPROVE" ? mintFor(this.#s, spec.runId, purchase) : purchase;
  }

  async #buy(spec: PurchaseSpec, mode: CheckoutMode | null) {
    const purchase = await this.#mint(spec);
    const { decision, card } = purchase;
    if (card && mode) await checkout(this.#s, spec.runId, card, decision, mode);
    return { outcome: decision.outcome, decisionId: decision.id };
  }

  /** The newest card in the wanted state with the decision that approved it, minting one first when needed. */
  async #cardFor(runId: string, want: "ACTIVE" | "USED") {
    const s = this.#s;
    const find = () => s.cards().filter((c) => c.state === want).at(-1);
    const existing = find();
    const approval = (id: string) => {
      const e = s.entries.find((x) => x.kind === "DECISION" && x.payload.id === id);
      if (!e || e.kind !== "DECISION") throw new Error("approving decision not found");
      return e.payload;
    };
    if (existing) {
      skipUpstream(s, runId, "uses the card minted earlier");
      return { card: existing, decision: approval(existing.decision_id), outcome: "APPROVE" as const };
    }
    const bought = await this.#buy(presetSpec(s, runId, "tee"), want === "USED" ? "exact" : null);
    const made = find();
    if (!made) return { card: undefined, decision: undefined, outcome: bought.outcome };
    return { card: made, decision: approval(made.decision_id), outcome: "APPROVE" as const };
  }

  async #onCard(runId: string, want: "ACTIVE" | "USED", mode: CheckoutMode, note?: string) {
    const got = await this.#cardFor(runId, want);
    if (!got.card || !got.decision) return { outcome: got.outcome, note: "No card to use: the purchase was stopped first." };
    const outcome = await checkout(this.#s, runId, got.card, got.decision, mode);
    return { outcome, decisionId: got.decision.id, ...(note ? { note } : {}) };
  }

  runScenario(id: ScenarioId): Promise<RunSummary> {
    return this.#run(id, async (runId) => {
      const s = this.#s;
      const spec = (key: PresetKey) => presetSpec(s, runId, key);
      switch (id) {
        case "normal":
          return this.#buy(spec("tee"), "exact");
        case "small":
          return this.#buy(spec("socks"), "exact");
        case "mint":
          return this.#buy(spec("tee"), null);
        case "flagged":
          return this.#buy(spec("hoodie"), null);
        case "overflow":
          return this.#buy(spec("overflow"), null);
        case "injected":
          return this.#buy(spec("injected"), null);
        case "unverified":
          return this.#buy(spec("unverified"), null);
        case "pay":
          return this.#onCard(runId, "ACTIVE", "exact");
        case "overshoot":
          return this.#onCard(runId, "ACTIVE", "overshoot");
        case "wrong_merchant":
          return this.#onCard(runId, "ACTIVE", "wrong_merchant");
        case "drift":
          return this.#onCard(runId, "ACTIVE", "drift");
        case "timeout":
          return this.#onCard(runId, "ACTIVE", "timeout");
        case "replay":
          return this.#onCard(runId, "USED", "replay");
        case "revoke": {
          const got = await this.#cardFor(runId, "ACTIVE");
          return { outcome: got.card ? ("INFO" as const) : got.outcome, note: "Hold Revoke to void the unused card." };
        }
      }
    });
  }

  propose(req: ProposeRequest): Promise<RunSummary> {
    return this.#run("custom", (runId) => this.#buy(customSpec(this.#s, runId, req.listingText), "exact"));
  }

  // ---------- mandate and escalation ----------

  revoke(req: { readonly reason?: string } = {}): Promise<RevokeResult> {
    return this.#enqueue(async () => {
      const s = this.#s;
      const mandate = s.requireMandate();
      const at = s.nowIso();
      const revocation: Revocation = {
        mandate_id: mandate.id,
        revoked_at: at,
        ...(req.reason ? { reason: req.reason } : {}),
        signer: mandate.delegator,
        signature: PLACEHOLDER_SIGNATURE,
      };
      s.append("MANDATE_REVOKED", revocation);
      s.markRevoked(at);
      const active = s.cards().filter((c) => c.state === "ACTIVE");
      for (const card of active) {
        const event = await s.rail.void(card.id, s.now());
        s.append("CARD_EVENT", event);
        s.emit({ type: "card.event", runId: "revoke", event, beat: "void" });
      }
      const voidedCardIds = active.map((c) => c.id);
      s.emit({ type: "mandate.revoked", at, voidedCardIds });
      return { revokedAt: at, voidedCardIds };
    });
  }

  answerEscalation(req: EscalationAnswerRequest): Promise<RunSummary> {
    return this.#enqueue(async () => {
      const s = this.#s;
      expireDueEscalations(s);
      const open = s.escalations.get(req.decisionId);
      if (!open || open.view.state !== "OPEN") {
        return { runId: open?.decisionRunId ?? "none", scenario: "custom", outcome: "DENY", decisionId: req.decisionId, note: "Escalation already closed." } as RunSummary;
      }
      const { decision, runId } = answerOpenEscalation(s, req.decisionId, req.choice);
      let outcome: RunOutcome = decision.outcome;
      if (decision.outcome === "APPROVE") {
        const bought = await mintFor(s, runId, { decision, cart: decision.cart });
        if (bought.card) await checkout(s, runId, bought.card, decision, "exact");
      }
      s.emit({ type: "run.finished", runId, outcome, at: s.nowIso() });
      outcome = decision.outcome;
      return { runId, scenario: "custom", outcome, decisionId: decision.id };
    });
  }

  /** R11 and S6: stop unanswered escalations whose window passed, and expire cards past their TTL. */
  sweepEscalations(): Promise<number> {
    return this.#enqueue(async () => {
      const s = this.#s;
      if (!s.mandate) return 0;
      const closed = expireDueEscalations(s);
      for (const event of await s.rail.expireDue(s.now())) {
        s.append("CARD_EVENT", event);
        s.emit({ type: "card.event", runId: "sweep", event, beat: "expire" });
      }
      return closed;
    });
  }

  // ---------- log ----------

  async getLog(): Promise<LogView> {
    return this.#view();
  }

  async verify(): Promise<VerifyOutcome> {
    const s = this.#s;
    const shown = this.#view().entries;
    return { result: verifyMockChain(shown, s.head()), checked: CHECKED, skipped: SKIPPED, at: s.nowIso() };
  }

  async tamper(): Promise<LogView> {
    this.#s.setTamper(tamperCopy(this.#s.entries));
    return this.#view();
  }

  async restore(): Promise<LogView> {
    this.#s.setTamper(null);
    return this.#view();
  }
}
