// OrchestratorEvent -> TraceEvent (apps/web/src/api/types.ts). The contract maps almost 1:1; the server adds what
// only it knows: the booth scenario of a run, the card beat of each checkout (overshoot, exact, replay, ...), the
// planner trace (last typed step + planner latency) on the cart event, and the run a resolution belongs to.
// One booth run spans several orchestrator operations (submit, then checkouts), so the orchestrator's per-operation
// run.started/run.finished are dropped: the runner emits one of each per booth run. Cards go out without the handle.
import type { OrchestratorEvent } from "@laisee/core/orchestrator";
import type { CardBeat, CardRecord, PlannerTraceInfo, ScenarioId, TraceEvent } from "../../api/types";

export type RunScenario = ScenarioId | "custom";

interface PlannerSeen {
  readonly choice?: string;
  readonly probabilities?: Readonly<Record<string, number>>;
  readonly latencyMs?: number;
}

interface ActiveRun {
  readonly scenario: RunScenario;
  readonly beat: CardBeat | null;
}

/** Which runs the server is driving right now, and where later resolutions of their decisions belong. */
export class RunTracker {
  #active: ReadonlyMap<string, ActiveRun> = new Map();
  #decisionRuns: ReadonlyMap<string, { readonly runId: string; readonly scenario: RunScenario }> = new Map();
  #planner: ReadonlyMap<string, PlannerSeen> = new Map();
  #errors: ReadonlyMap<string, string> = new Map();
  #judgeFailed: ReadonlySet<string> = new Set();

  begin(runId: string, scenario: RunScenario): void {
    this.#active = new Map([...this.#active, [runId, { scenario, beat: null }]]);
  }

  setBeat(runId: string, beat: CardBeat | null): void {
    const run = this.#active.get(runId);
    if (run !== undefined) this.#active = new Map([...this.#active, [runId, { ...run, beat }]]);
  }

  end(runId: string): void {
    this.#active = new Map([...this.#active].filter(([id]) => id !== runId));
    this.#planner = new Map([...this.#planner].filter(([id]) => id !== runId));
    this.#errors = new Map([...this.#errors].filter(([id]) => id !== runId));
    this.#judgeFailed = new Set([...this.#judgeFailed].filter((id) => id !== runId));
  }

  clear(): void {
    this.#active = new Map();
    this.#decisionRuns = new Map();
    this.#planner = new Map();
    this.#errors = new Map();
    this.#judgeFailed = new Set();
  }

  isActive(runId: string): boolean {
    return this.#active.has(runId);
  }

  beatOf(runId: string): CardBeat | null {
    return this.#active.get(runId)?.beat ?? null;
  }

  runOfDecision(decisionId: string): { readonly runId: string; readonly scenario: RunScenario } | undefined {
    return this.#decisionRuns.get(decisionId);
  }

  rememberDecision(decisionId: string, runId: string): void {
    const scenario = this.#active.get(runId)?.scenario ?? this.#decisionRuns.get(decisionId)?.scenario ?? "custom";
    this.#decisionRuns = new Map([...this.#decisionRuns, [decisionId, { runId, scenario }]]);
  }

  notePlanner(runId: string, seen: PlannerSeen): void {
    this.#planner = new Map([...this.#planner, [runId, { ...this.#planner.get(runId), ...seen }]]);
  }

  plannerOf(runId: string): PlannerSeen | undefined {
    return this.#planner.get(runId);
  }

  noteError(runId: string, message: string): void {
    this.#errors = new Map([...this.#errors, [runId, message]]);
  }

  errorOf(runId: string): string | undefined {
    return this.#errors.get(runId);
  }

  /** The judge gave no usable answer (TIMEOUT or ERROR) in this run. */
  noteJudgeFailure(runId: string): void {
    this.#judgeFailed = new Set([...this.#judgeFailed, runId]);
  }

  judgeFailed(runId: string): boolean {
    return this.#judgeFailed.has(runId);
  }
}

/** A run the server did not start (a tick) that resolves an earlier decision is shown on that decision's run. */
function routeRun(tracker: RunTracker, runId: string, resolves?: string | null): string {
  if (tracker.isActive(runId) || resolves === undefined || resolves === null) return runId;
  return tracker.runOfDecision(resolves)?.runId ?? runId;
}

function plannerInfo(provider: PlannerTraceInfo["provider"], seen: PlannerSeen | undefined): PlannerTraceInfo {
  return {
    provider,
    ...(seen?.choice === undefined ? {} : { choice: seen.choice }),
    ...(seen?.probabilities === undefined ? {} : { probabilities: seen.probabilities }),
    ...(seen?.latencyMs === undefined ? {} : { latencyMs: seen.latencyMs }),
  };
}

function beatOf(tracker: RunTracker, runId: string, cause: "checkout" | "void" | "expire"): CardBeat {
  if (cause === "void") return "void";
  if (cause === "expire") return "expire";
  return tracker.beatOf(runId) ?? "exact";
}

export function mapEvent(event: OrchestratorEvent, tracker: RunTracker, provider: PlannerTraceInfo["provider"]): readonly TraceEvent[] {
  switch (event.type) {
    case "mandate.sealed":
      return [{ type: "mandate.sealed", mandate: event.mandate, packet: event.packet, at: event.at }];
    case "mandate.revoked":
      return [{ type: "mandate.revoked", at: event.at, voidedCardIds: event.voidedCardIds }];
    case "run.started":
    case "run.finished":
    case "checkpoint":
      return [];
    case "planner.step":
      tracker.notePlanner(event.runId, { choice: event.step.choice, probabilities: event.step.probabilities });
      return [];
    case "error":
      tracker.noteError(event.runId, event.message);
      return [];
    case "stage": {
      if (event.stage === "planner" && event.status === "done" && event.latencyMs !== undefined) tracker.notePlanner(event.runId, { latencyMs: event.latencyMs });
      const { type, stage, status, at } = event;
      return [{ type, runId: event.runId, stage, status, at, ...(event.note === undefined ? {} : { note: event.note }), ...(event.latencyMs === undefined ? {} : { latencyMs: event.latencyMs }) }];
    }
    case "cart":
      return [{ type: "cart", runId: event.runId, cart: event.cart, listingText: event.listingText, ...(event.plannerNote === undefined ? {} : { plannerNote: event.plannerNote }), planner: plannerInfo(provider, tracker.plannerOf(event.runId)) }];
    case "judge":
      if (event.judge.status !== "OK") tracker.noteJudgeFailure(event.runId);
      return [{ type: "judge", runId: event.runId, judge: event.judge }];
    case "decision": {
      const runId = routeRun(tracker, event.runId, event.decision.resolves);
      if (event.decision.outcome === "ESCALATE") tracker.rememberDecision(event.decision.id, runId);
      return [{ type: "decision", runId, decision: event.decision }];
    }
    case "card.minted":
      // CardView has no handle (I8); the UI types call it CardRecord and never read the handle.
      return [{ type: "card.minted", runId: event.runId, card: event.card as CardRecord }];
    case "card.event":
      return [{ type: "card.event", runId: event.runId, event: event.event, beat: beatOf(tracker, event.runId, event.cause) }];
    case "log":
      return [{ type: "log", entry: event.entry }];
    case "packet":
      return [{ type: "packet", packet: event.packet }];
    case "escalation":
      return [{ type: "escalation", escalation: event.escalation }];
  }
}
