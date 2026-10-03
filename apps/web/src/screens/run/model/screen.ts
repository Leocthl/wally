// Which state the Wally screen shows, as a pure function of the booth state and the decision id in the route
// (#/wally?d=<id>): idle, a run in progress, or a result (approved, stopped, needs your OK, no clear pick, error).
// The engine's outcome decides the result; nothing here re-derives a verdict.
import type { CardRecord, EscalationView } from "../../../api/types";
import { currentRun, type BoothState, type RunView } from "../../../state/booth";
import { closedBudget, type ClosedBudget } from "../../../state/closedBudget";
import { cardOf, cardUsedBy, chainOf, escalationOf, knownDecisions, runInvolves, type Chain } from "./chain";
import { cardStory, type StoryItem } from "./story";

export type ResultKind = "approved" | "stopped" | "needsOk" | "noPick" | "error" | "info";

/** How an escalation ended, when the chain had one. "cancelled" and "ended": nobody answered before the budget was over. */
export type Answer = "yes" | "no" | "expired" | "yesButRule" | "cancelled" | "ended";

export interface Result {
  readonly kind: ResultKind;
  /** Stable per purchase (the root decision id, else the run id): focus, haptics and motion fire once per key. */
  readonly key: string;
  readonly chain?: Chain;
  readonly card?: CardRecord;
  readonly story: readonly StoryItem[];
  readonly escalation?: EscalationView;
  readonly answer?: Answer;
  readonly run?: RunView;
  /** A run is still writing to this result (a checkout on its card). */
  readonly busy: boolean;
  readonly note?: string;
  /** Why a run that decided nothing ended (UNKNOWN_REQUEST, NO_PROPOSAL:<reason>...), so the screen words it. */
  readonly code?: string;
  /** The latest run repeated a live cart: this is the earlier purchase, and nothing new was decided, minted or charged. */
  readonly repeat?: true;
}

export type ScreenModel = { readonly kind: "idle" } | { readonly kind: "working"; readonly run: RunView } | { readonly kind: "result"; readonly result: Result };

/** A question that is still unanswered when the budget is cancelled or has ended is closed: there is nothing left to answer. */
function closedAnswer(chain: Chain, over: ClosedBudget | null): "cancelled" | "ended" | undefined {
  if (over === null || chain.current.outcome !== "ESCALATE") return undefined;
  return over === "ended" ? "ended" : "cancelled";
}

function answerOf(chain: Chain, escalation: EscalationView | undefined, over: ClosedBudget | null): Answer | undefined {
  const closed = closedAnswer(chain, over);
  if (closed !== undefined) return closed;
  const resolution = chain.decisions.find((d) => d.resolves === chain.root.id && d.escalation !== undefined);
  const state = resolution?.escalation?.state ?? escalation?.state;
  if (state === "CLOSED") return "cancelled";
  if (state === "EXPIRED") return "expired";
  if (state === "DENIED") return "no";
  if (state !== "APPROVED") return undefined;
  return resolution && resolution.outcome === "DENY" && resolution.explanation?.template_id !== "R12.price_drift" ? "yesButRule" : "yes";
}

function kindOf(chain: Chain, over: ClosedBudget | null = null): ResultKind {
  switch (chain.current.outcome) {
    case "APPROVE":
      return "approved";
    case "ESCALATE":
      // A question nobody can answer any more is a stop, told as one.
      return closedAnswer(chain, over) === undefined ? "needsOk" : "stopped";
    case "DENY":
      return "stopped";
  }
}

export function chainResult(state: BoothState, chain: Chain, run: RunView | undefined): Result {
  const card = cardOf(state, chain);
  const escalation = escalationOf(state, chain);
  const over = closedBudget(state);
  const answer = answerOf(chain, escalation, over);
  return {
    kind: kindOf(chain, over),
    key: chain.root.id,
    chain,
    story: cardStory(state, card, chain.decisions),
    busy: run !== undefined && !run.finished,
    ...(card ? { card } : {}),
    ...(escalation ? { escalation } : {}),
    ...(answer ? { answer } : {}),
    ...(run ? { run } : {}),
  };
}

function bareResult(kind: ResultKind, run: RunView): Result {
  return { kind, key: run.runId, story: [], busy: false, run, ...(run.note ? { note: run.note } : {}), ...(run.code ? { code: run.code } : {}) };
}

/** A finished run that decided nothing: no clear pick, an error, or a step that only reused an earlier card. */
function undecided(run: RunView): Result {
  if (run.outcome === "ERROR") return bareResult("error", run);
  const plannerRan = run.stages.planner !== undefined && run.stages.planner.status !== "skipped";
  return bareResult(plannerRan && !run.cart ? "noPick" : "info", run);
}

/** A run that only presents an earlier card (pay, overshoot, replay, wrong shop, timeout) shows that card's result. */
function cardOnly(run: RunView): boolean {
  return run.stages.planner?.status === "skipped" || (run.stages.planner === undefined && run.cardEvents.length > 0);
}

function runChain(state: BoothState, run: RunView): Chain | undefined {
  const all = knownDecisions(state);
  const own = run.decisions.at(-1);
  if (own) return chainOf(all, own.id);
  // Before the rail answers, a card-only run is about the newest open card (the one the booth presents).
  const card = cardUsedBy(state, run) ?? (cardOnly(run) ? (state.cards.filter((c) => c.state === "ACTIVE").at(-1) ?? state.cards.at(-1)) : undefined);
  return card ? chainOf(all, card.decision_id) : undefined;
}

function latestScreen(state: BoothState, run: RunView): ScreenModel {
  const chain = runChain(state, run);
  if (!run.finished) {
    // Keep the steps on screen until the engine has spoken; a checkout on an earlier card updates its result live.
    if (cardOnly(run) && chain) return { kind: "result", result: chainResult(state, chain, run) };
    const decided = run.decisions.length > 0 && run.decisions.at(-1)?.outcome !== "APPROVE";
    return decided && chain ? { kind: "result", result: chainResult(state, chain, run) } : { kind: "working", run };
  }
  return { kind: "result", result: chain ? chainResult(state, chain, run) : undecided(run) };
}

/** A purchase pinned by the route, and the run that was the latest when it was pinned. */
export interface Pin {
  readonly id: string;
  readonly afterRun?: string;
}

/** The pinned chain while it should stay on screen: a run started after the pin, about something else, takes over. */
export function pinnedChain(state: BoothState, pin: Pin | undefined): Chain | undefined {
  const chain = pin ? chainOf(knownDecisions(state), pin.id) : undefined;
  const latest = currentRun(state);
  if (!chain || !latest || runInvolves(latest, chain, cardOf(state, chain))) return chain;
  const pinnedAt = pin?.afterRun === undefined ? -1 : state.runs.findIndex((r) => r.runId === pin.afterRun);
  return state.runs.length - 1 > pinnedAt ? undefined : chain;
}

export function selectScreen(state: BoothState, pin?: Pin): ScreenModel {
  const latest = currentRun(state);
  const pinned = pinnedChain(state, pin);
  if (pinned) {
    const live = latest !== undefined && runInvolves(latest, pinned, cardOf(state, pinned)) ? latest : undefined;
    return { kind: "result", result: chainResult(state, pinned, live) };
  }
  const again = latest?.finished && latest.duplicateOf !== undefined ? chainOf(knownDecisions(state), latest.duplicateOf) : undefined;
  if (again) return { kind: "result", result: { ...chainResult(state, again, undefined), repeat: true } };
  return latest ? latestScreen(state, latest) : { kind: "idle" };
}

export interface HistoryRow {
  readonly chain: Chain;
  readonly kind: ResultKind;
  readonly paid: boolean;
}

/** Recent purchases, newest first, one row per chain (a resolved question shows how it ended). */
export function history(state: BoothState, limit: number, exclude?: string): readonly HistoryRow[] {
  const all = knownDecisions(state);
  const over = closedBudget(state);
  const roots = all.filter((d) => d.resolves === undefined || !all.some((p) => p.id === d.resolves));
  return [...roots]
    .reverse()
    .filter((root) => root.id !== exclude)
    .slice(0, limit)
    .flatMap((root) => {
      const chain = chainOf(all, root.id);
      if (!chain) return [];
      const story = cardStory(state, cardOf(state, chain), chain.decisions);
      return [{ chain, kind: kindOf(chain, over), paid: story.some((s) => s.tone === "ok") }];
    });
}
