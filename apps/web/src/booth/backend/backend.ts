// BoothBackend over the orchestrator (A-26 contract). One session per sealed mandate; reset and every new seal open a
// fresh one (new orchestrator, rail, log id). All operations run one at a time through a queue, each after a tick
// (R11 expiry, card expiry, packet expiry). DEMO SHORTCUT: the delegator's throwaway key lives here and signs seal,
// revoke and escalation answers for the shopper; a real deployment keeps that key on the shopper's device.
// Portable (no node:*): the Node server (server/compose.ts) and the on-device client (src/api/local) both run it.
import type { OrchestratorEvent } from "@laisee/core/orchestrator";
import { toJsonl } from "@laisee/core/log";
import { signEscalationAnswer, signRevocation } from "@laisee/core/log";
import type { Decision, LogEntry } from "@laisee/core/generated";
import type { VerifyFailure } from "@laisee/core/ports";
import { verifyChain } from "@laisee/core/verify";
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
  PlannerTraceInfo,
  ProposeRequest,
  RevokeResult,
  RunSummary,
  ScenarioId,
  SealRequest,
  SealResult,
  TraceEvent,
  TraceListener,
  Unsubscribe,
  VerifyOutcome,
} from "../../api/types";
import type { AskSource } from "./ask";
import type { Catalogue } from "./catalogue";
import { compileRules, type ModelCompile } from "./compileRules";
import { BoothError } from "./errors";
import { mapEvent, RunTracker } from "./events";
import { createFamilyKit, familySummary, FAMILY_PARENT, PARENT_EXPORT_NOTE, type FamilyKit } from "./family";
import { ScenarioRunner } from "./runner";
import type { ScenarioEntry, ScenarioTable } from "./scenarioTable";
import { openSession, type Session, type SessionDeps } from "./session";
import type { Step } from "./step";
import { tamperCopy, type TamperedCopy } from "./tamper";
import type { BackendLogger, BoothBackend, ExportView } from "./types";

export const VERIFY_CHECKS: readonly VerifyFailure[] = ["SCHEMA", "SEQ", "PREV_HASH", "PAYLOAD_HASH", "ENTRY_HASH", "SIGNATURE", "PAYLOAD_SIGNATURE", "TRUNCATED"];

export interface BackendDeps {
  /** Rebuilt on reset (keys may have been regenerated on disk). */
  readonly sessionDeps: () => SessionDeps;
  readonly catalogue: Catalogue;
  readonly table: ScenarioTable;
  readonly plannerProvider: PlannerTraceInfo["provider"];
  /** Ask Wally: the shelf a live planner chooses among, or the requests that have a recording (ask.ts). */
  readonly ask: AskSource;
  /** Reads a sentence into rules with the local model; null = the fixed rules parser only (compileRules.ts). */
  readonly compileModel: ModelCompile | null;
  readonly info: () => ApiInfo;
  readonly presetSeal: (now: Date) => SealRequest;
  readonly logger: BackendLogger;
  /** Run note when the judge gave no usable answer (on-device mode says the judge is offline there). Default: none. */
  readonly judgeOfflineNote?: string;
  /** The note on exported public keys. Default: the server's. */
  readonly keysNote?: string;
}

const iso = (d: Date): string => d.toISOString().replace(".000Z", "Z");

/** Orchestrator codes that mean "this escalation is not open any more" (answered, expired by R11, or unknown). */
const CLOSED_ESCALATION_CODES: readonly string[] = ["UNKNOWN_ESCALATION", "INVALID_ANSWER", "ESCALATION_CLOSED"];

const CLOSED_ESCALATION_MESSAGE = "This escalation is no longer open (answered, or stopped by R11).";

/** Before the first successful seal: nothing sealed, so the UI seals the preset itself. */
const EMPTY_SNAPSHOT: BoothSnapshot = { mandate: null, intentText: null, packet: null, cards: [], log: { entries: [], head: null, tampered: null }, escalations: [] };

export class OrchestratorBackend implements BoothBackend {
  readonly #d: BackendDeps;
  readonly #tracker = new RunTracker();
  #listeners: ReadonlySet<TraceListener> = new Set();
  #session: Session | null = null;
  #deps: SessionDeps;
  #tamper: TamperedCopy | null = null;
  /** Mum's ceiling for the demo keys in use; made on first use, dropped on reset (new keys, new Mum). */
  #family: FamilyKit | null = null;
  #queue: Promise<unknown> = Promise.resolve();
  #busy = 0;

  constructor(deps: BackendDeps) {
    this.#d = deps;
    this.#deps = deps.sessionDeps();
  }

  /** Seals the preset mandate M0 so the booth is ready on first load [F20]. */
  async start(): Promise<void> {
    await this.#enqueue(() => this.#open(this.#d.presetSeal(this.#deps.clock.now()), true));
  }

  close(): void {
    this.#session?.close();
    this.#session = null;
  }

  get busy(): boolean {
    return this.#busy > 0;
  }

  subscribe(listener: TraceListener): Unsubscribe {
    this.#listeners = new Set([...this.#listeners, listener]);
    return () => {
      this.#listeners = new Set([...this.#listeners].filter((l) => l !== listener));
    };
  }

  #emit = (event: TraceEvent): void => {
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch {
        // a failing listener (a dropped SSE client) never stops the pipeline
      }
    }
  };

  #onEvent = (event: OrchestratorEvent): void => {
    for (const mapped of mapEvent(event, this.#tracker, this.#d.plannerProvider)) this.#emit(mapped);
  };

  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.#busy += 1;
    const next = this.#queue.then(task, task).finally(() => {
      this.#busy -= 1;
    });
    this.#queue = next.catch(() => undefined);
    return next;
  }

  /** Every request first lets due expiries happen, so what it sees is current. */
  #op<T>(task: (session: Session) => Promise<T>): Promise<T> {
    return this.#enqueue(async () => {
      const session = this.#require();
      await this.#tickNow(session);
      return task(session);
    });
  }

  #require(): Session {
    if (this.#session === null) throw new BoothError(409, "NOT_SEALED", "no mandate is sealed yet");
    return this.#session;
  }

  async #tickNow(session: Session): Promise<void> {
    try {
      const result = await session.orchestrator.tick();
      for (const problem of result.problems) this.#d.logger.error(`tick: ${problem.code} ${problem.message}`);
    } catch (err) {
      this.#d.logger.error(`tick failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  /** Timer tick: skipped while a request is running (that request ticks first anyway). */
  tick(): Promise<void> {
    if (this.busy || this.#session === null) return Promise.resolve();
    return this.#enqueue(async () => {
      if (this.#session !== null) await this.#tickNow(this.#session);
    });
  }

  #familyOn(): boolean {
    return this.#d.info().features.family;
  }

  /** Mum's kit for the keys in use: made once, from the preset budget's end date. */
  #kit(): FamilyKit {
    if (!this.#familyOn()) throw new BoothError(404, "FAMILY_OFF", "Family budgets are off on this booth.");
    this.#family ??= createFamilyKit(this.#deps, this.#d.presetSeal(this.#deps.clock.now()).validUntil);
    return this.#family;
  }

  /**
   * A new seal replaces the session held now. While it is checked, the family budget held now gives its share back, so
   * Mei can seal a new amount under Mum's ceiling; a refused seal puts the share back and nothing else changes.
   */
  #holdOut(old: Session | null, kit: FamilyKit | null): () => void {
    if (old === null || kit === null || old.familyKit !== kit) return () => undefined;
    const held = kit.ledger.release(kit.parentId, old.mandateId);
    return () => kit.ledger.reserve(kit.parentId, old.mandateId, held);
  }

  async #open(req: SealRequest, reloadDeps: boolean): Promise<SealResult> {
    const deps = reloadDeps ? this.#d.sessionDeps() : this.#deps;
    if (reloadDeps) this.#family = null;
    const kit = req.family === undefined ? null : this.#kit();
    const old = this.#session;
    const restore = this.#holdOut(old, kit);
    let session: Session;
    try {
      session = await openSession(deps, req, kit);
    } catch (err) {
      restore();
      throw err;
    }
    this.#deps = deps;
    this.#session = session;
    this.#tamper = null;
    old?.close();
    old?.familyKit?.ledger.release(old.familyKit.parentId, old.mandateId); // the replaced budget no longer holds Mum's money
    this.#tracker.clear();
    this.#emit({ type: "reset", at: iso(deps.clock.now()) });
    session.goLive(this.#onEvent);
    const snap = await session.orchestrator.snapshot();
    if (snap.mandate === null || snap.packet === null || snap.head === null) throw new BoothError(500, "SEAL_STATE", "the sealed packet is missing");
    return { mandate: snap.mandate, packet: snap.packet, head: snap.head };
  }

  async info(): Promise<ApiInfo> {
    return this.#d.info();
  }

  seal(req: SealRequest): Promise<SealResult> {
    return this.#enqueue(() => this.#open(req, false));
  }

  async reset(): Promise<void> {
    await this.#enqueue(() => this.#open(this.#d.presetSeal(this.#deps.clock.now()), true));
  }

  #runner(session: Session): ScenarioRunner {
    return new ScenarioRunner({
      orchestrator: session.orchestrator,
      merchant: session.merchant,
      tracker: this.#tracker,
      emit: this.#emit,
      clock: this.#deps.clock,
      catalogue: this.#d.catalogue,
      table: this.#d.table,
      runId: () => this.#deps.newId("run"),
      ...(this.#d.judgeOfflineNote === undefined ? {} : { judgeOfflineNote: this.#d.judgeOfflineNote }),
    });
  }

  runScenario(id: ScenarioId): Promise<RunSummary> {
    const entry = this.#d.table.scenarios[id];
    if (entry.family !== null) return this.#enqueue(() => this.#familyScenario(entry, entry.family?.sealMinor ?? 0));
    return this.#op((session) => this.#runner(session).scenario(entry));
  }

  /**
   * family_ok and family_over start from any state. Both open with Mei's seal under Mum's ceiling. family_ok first makes a
   * fresh Mum (a new key and credential, nothing given out) and replaces the budget held now with the new one, then buys
   * as the table says. family_over keeps the Mum in use and the budget held now: its seal is too big, so it is refused and
   * nothing changes (nothing is logged or sealed, the share held stays held); the run ends with the refusal.
   */
  async #familyScenario(entry: ScenarioEntry, sealMinor: number): Promise<RunSummary> {
    if (entry.run !== "seal") this.#family = null;
    const preset = this.#d.presetSeal(this.#deps.clock.now());
    const req: SealRequest = { ...preset, rules: { ...preset.rules, budget: { amount_minor: sealMinor, currency: "HKD" } }, family: { parent: FAMILY_PARENT } };
    let refused: Step | undefined;
    try {
      await this.#open(req, false);
    } catch (err) {
      if (!(err instanceof BoothError)) throw err;
      refused = { outcome: err.code === "EXCEEDS_PARENT" ? "DENY" : "ERROR", code: err.code, note: err.message };
    }
    const session = this.#require();
    await this.#tickNow(session);
    return this.#runner(session).scenario(entry, refused);
  }

  /** Mum's budget as a family seal sees it (her credential is made on the first call). */
  family(): Promise<FamilySummary> {
    return this.#enqueue(async () => familySummary(this.#kit()));
  }

  propose(req: ProposeRequest): Promise<RunSummary> {
    return this.#op((session) => this.#runner(session).custom(req.listingText));
  }

  revoke(req: { readonly reason?: string }): Promise<RevokeResult> {
    return this.#op(async (session) => {
      const now = this.#deps.clock.now();
      const signed = signRevocation({ mandate_id: session.mandateId, revoked_at: now, ...(req.reason === undefined ? {} : { reason: req.reason }) }, this.#deps.delegator);
      const result = await session.orchestrator.revoke(signed, { runId: this.#deps.newId("run") });
      if (!result.ok) throw new BoothError(result.code === "INVALID_REVOCATION" ? 400 : 500, result.code, result.message);
      if (result.failedCardIds.length > 0) this.#d.logger.error(`revoke: the rail could not void ${result.failedCardIds.join(", ")}`);
      return { revokedAt: result.revokedAt, voidedCardIds: result.voidedCardIds };
    });
  }

  async #loggedDecision(session: Session, decisionId: string): Promise<Decision | undefined> {
    const { log } = await session.orchestrator.snapshot();
    for (const entry of log) if (entry.kind === "DECISION" && entry.payload.id === decisionId) return entry.payload;
    return undefined;
  }

  ask(req: AskRequest): Promise<RunSummary> {
    return this.#op((session) => this.#runner(session).ask(req.requestText, this.#d.ask));
  }

  suggestAlternatives(req: AlternativesRequest): Promise<RunSummary> {
    return this.#op(async (session) => {
      await this.#requireBudgetStop(session, req.decisionId);
      return this.#runner(session).alternatives(req.decisionId);
    });
  }

  /** Cheaper options exist only after a DENY by R3 or R4; anything else is refused before a run starts. */
  async #requireBudgetStop(session: Session, decisionId: string): Promise<void> {
    const log = (await session.orchestrator.snapshot()).log;
    const decision = log.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : [])).find((d) => d.id === decisionId);
    const template = decision?.explanation?.template_id;
    if (decision?.outcome !== "DENY" || (template !== "R3.over_remaining" && template !== "R4.over_cap")) {
      throw new BoothError(409, "NOT_APPLICABLE", "Only a purchase stopped by the budget (R3) or the per-purchase cap (R4) has cheaper options.");
    }
  }

  /** Needs no session: it reads a sentence and seals nothing. */
  compileRules(req: CompileRulesRequest): Promise<CompileResult> {
    return compileRules(req, { now: this.#deps.clock.now(), model: this.#d.compileModel });
  }

  answerEscalation(req: EscalationAnswerRequest): Promise<RunSummary> {
    return this.#op(async (session) => {
      const origin = this.#tracker.runOfDecision(req.decisionId);
      const runId = origin?.runId ?? this.#deps.newId("run");
      const scenario = origin?.scenario ?? "custom";
      // laisee.resolve.v2 binds the answer to the escalated decision, its mandate and its cart; an id nothing logged is closed.
      const escalated = await this.#loggedDecision(session, req.decisionId);
      if (escalated === undefined) throw new BoothError(409, "ESCALATION_CLOSED", CLOSED_ESCALATION_MESSAGE);
      const answer = signEscalationAnswer(
        { decision_id: escalated.id, mandate_id: escalated.mandate_id, cart: escalated.cart, choice: req.choice, answered_at: this.#deps.clock.now() },
        this.#deps.delegator,
      );
      this.#tracker.begin(runId, scenario);
      try {
        const result = await session.orchestrator.answerEscalation(answer, { runId, checkout: "auto" });
        if (!result.ok) {
          const code: string = result.code;
          const closed = CLOSED_ESCALATION_CODES.includes(code);
          throw new BoothError(closed ? 409 : 500, closed ? "ESCALATION_CLOSED" : result.code, closed ? CLOSED_ESCALATION_MESSAGE : result.message);
        }
        this.#emit({ type: "run.finished", runId, outcome: result.outcome, at: iso(this.#deps.clock.now()) });
        return { runId, scenario, outcome: result.outcome, decisionId: result.decision.id };
      } finally {
        this.#tracker.end(runId);
      }
    });
  }

  snapshot(): Promise<BoothSnapshot> {
    if (this.#session === null) return Promise.resolve(EMPTY_SNAPSHOT);
    return this.#op(async (session) => {
      const snap = await session.orchestrator.snapshot();
      // CardView has no handle (I8); the UI types call it CardRecord and never read the handle.
      const cards = snap.cards as BoothSnapshot["cards"];
      return { mandate: snap.mandate, intentText: session.intentText, packet: snap.packet, cards, log: this.#view(snap.log, snap.head), escalations: snap.escalations };
    });
  }

  #view(entries: readonly LogEntry[], head: LogView["head"]): LogView {
    const t = this.#tamper;
    // Any new entry ends a tamper demo: the copy no longer matches the log.
    if (t !== null && t.entries.length !== entries.length) this.#tamper = null;
    const live = this.#tamper;
    return { entries: live ? live.entries : entries, head, tampered: live ? { seq: live.seq, field: live.field, before: live.before, after: live.after } : null };
  }

  getLog(): Promise<LogView> {
    if (this.#session === null) return Promise.resolve(EMPTY_SNAPSHOT.log);
    return this.#op(async (session) => {
      const snap = await session.orchestrator.snapshot();
      return this.#view(snap.log, snap.head);
    });
  }

  verify(): Promise<VerifyOutcome> {
    return this.#op(async (session) => {
      const snap = await session.orchestrator.snapshot();
      const shown = this.#view(snap.log, snap.head).entries;
      const result = verifyChain(shown, { engine: [session.engineDid], delegator: session.delegatorDid }, snap.head ?? undefined);
      return { result, checked: VERIFY_CHECKS, skipped: [], at: iso(this.#deps.clock.now()) };
    });
  }

  tamper(): Promise<LogView> {
    return this.#op(async (session) => {
      const snap = await session.orchestrator.snapshot();
      this.#tamper = tamperCopy(snap.log);
      return this.#view(snap.log, snap.head);
    });
  }

  restore(): Promise<LogView> {
    return this.#op(async (session) => {
      this.#tamper = null;
      const snap = await session.orchestrator.snapshot();
      return this.#view(snap.log, snap.head);
    });
  }

  exportLog(): Promise<ExportView> {
    return this.#op(async (session) => {
      const snap = await session.orchestrator.snapshot();
      const kit = session.familyKit;
      return {
        log: toJsonl(snap.log),
        publicKeys: {
          note: this.#d.keysNote ?? "Throwaway demo keys this server signs with right now (rail SIMULATED). Public keys only.",
          engine: [session.engineDid],
          delegator: session.delegatorDid,
          agent: session.agentDid,
          ...(kit === null ? {} : { parent: kit.signer.did }),
        },
        checkpoint: snap.head,
        ...(kit === null ? {} : { parentCredential: kit.credential, parentNote: PARENT_EXPORT_NOTE }),
      };
    });
  }
}
