// BoothBackend over the orchestrator (A-26 contract). One session per sealed mandate; reset and every new seal open a
// fresh one (new orchestrator, rail, log id). All operations run one at a time through a queue, each after a tick
// (R11 expiry, card expiry, packet expiry). DEMO SHORTCUT: the delegator's throwaway key lives here and signs seal,
// revoke and escalation answers for the shopper; a real deployment keeps that key on the shopper's device.
import type { OrchestratorEvent } from "@laisee/core/orchestrator";
import { toJsonl } from "@laisee/core/log";
import { signEscalationAnswer, signRevocation } from "@laisee/core/log";
import type { LogEntry } from "@laisee/core/generated";
import type { VerifyFailure } from "@laisee/core/ports";
import { verifyChain } from "@laisee/core/verify";
import { tamperCopy, type TamperedCopy } from "../../src/api/mock/log";
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
  TraceEvent,
  TraceListener,
  Unsubscribe,
  VerifyOutcome,
} from "../../src/api/types";
import type { BoothBackend, ExportView } from "../backend";
import { BoothError } from "../http/errors";
import type { Logger } from "../http/routes";
import type { Catalogue } from "./catalogue";
import { mapEvent, RunTracker } from "./events";
import { ScenarioRunner } from "./runner";
import type { ScenarioTable } from "./scenarioTable";
import { openSession, type Session, type SessionDeps } from "./session";

export const VERIFY_CHECKS: readonly VerifyFailure[] = ["SCHEMA", "SEQ", "PREV_HASH", "PAYLOAD_HASH", "ENTRY_HASH", "SIGNATURE", "PAYLOAD_SIGNATURE", "TRUNCATED"];

export interface BackendDeps {
  /** Rebuilt on reset (keys may have been regenerated on disk). */
  readonly sessionDeps: () => SessionDeps;
  readonly catalogue: Catalogue;
  readonly table: ScenarioTable;
  readonly plannerProvider: "rule" | "replay";
  readonly info: () => ApiInfo;
  readonly presetSeal: (now: Date) => SealRequest;
  readonly logger: Logger;
}

const iso = (d: Date): string => d.toISOString().replace(".000Z", "Z");

/** Before the first successful seal: nothing sealed, so the UI seals the preset itself. */
const EMPTY_SNAPSHOT: BoothSnapshot = { mandate: null, intentText: null, packet: null, cards: [], log: { entries: [], head: null, tampered: null }, escalations: [] };

export class OrchestratorBackend implements BoothBackend {
  readonly #d: BackendDeps;
  readonly #tracker = new RunTracker();
  #listeners: ReadonlySet<TraceListener> = new Set();
  #session: Session | null = null;
  #deps: SessionDeps;
  #tamper: TamperedCopy | null = null;
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

  async #open(req: SealRequest, reloadDeps: boolean): Promise<SealResult> {
    const deps = reloadDeps ? this.#d.sessionDeps() : this.#deps;
    const session = await openSession(deps, req);
    const old = this.#session;
    this.#deps = deps;
    this.#session = session;
    this.#tamper = null;
    old?.close();
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
    });
  }

  runScenario(id: ScenarioId): Promise<RunSummary> {
    return this.#op((session) => this.#runner(session).scenario(this.#d.table.scenarios[id]));
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

  answerEscalation(req: EscalationAnswerRequest): Promise<RunSummary> {
    return this.#op(async (session) => {
      const origin = this.#tracker.runOfDecision(req.decisionId);
      const runId = origin?.runId ?? this.#deps.newId("run");
      const scenario = origin?.scenario ?? "custom";
      const answer = signEscalationAnswer({ decision_id: req.decisionId, choice: req.choice, answered_at: this.#deps.clock.now() }, this.#deps.delegator);
      this.#tracker.begin(runId, scenario);
      try {
        const result = await session.orchestrator.answerEscalation(answer, { runId, checkout: "auto" });
        if (!result.ok) {
          const closed = result.code === "UNKNOWN_ESCALATION" || result.code === "INVALID_ANSWER";
          throw new BoothError(closed ? 409 : 500, closed ? "ESCALATION_CLOSED" : result.code, closed ? "This escalation is no longer open (answered, or stopped by R11)." : result.message);
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
      return {
        log: toJsonl(snap.log),
        publicKeys: {
          note: "Throwaway demo keys this server signs with right now (rail SIMULATED). Public keys only.",
          engine: [session.engineDid],
          delegator: session.delegatorDid,
          agent: session.agentDid,
        },
        checkpoint: snap.head,
      };
    });
  }
}
