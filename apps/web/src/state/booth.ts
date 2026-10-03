// Booth state: a pure fold of trace events. No hidden state, no mutation (CLAUDE.md immutability). The same reducer
// serves the MockApiClient and the later SSE client, because both speak TraceEvent.
import type {
  BoothSnapshot, CardBeat, CardEvent, CardRecord, Cart, Decision, EscalationView, JudgeRecord, LogEntry, LogView, Mandate,
  PacketState, PlannerTraceInfo, RunOutcome, ScenarioId, Stage, StageStatus, TraceEvent,
} from "../api/types";
import { closedBudget } from "./closedBudget";
import { storedEntries } from "./storedEntries";

export interface StageView {
  readonly status: StageStatus;
  readonly note?: string;
  readonly latencyMs?: number;
}

export interface RunView {
  readonly runId: string;
  readonly scenario: ScenarioId | "custom";
  readonly startedAt: string;
  readonly stages: Readonly<Partial<Record<Stage, StageView>>>;
  readonly cart?: Cart;
  readonly listingText?: string;
  readonly plannerNote?: string;
  readonly planner?: PlannerTraceInfo;
  readonly judge?: JudgeRecord;
  /** The first decision is the proposal's; later ones resolve it (R11, R12, delegator answer). The last one is current. */
  readonly decisions: readonly Decision[];
  readonly mintedCard?: CardRecord;
  readonly cardEvents: readonly { readonly event: CardEvent; readonly beat: CardBeat }[];
  readonly outcome?: RunOutcome;
  readonly note?: string;
  /** Stable reason the run ended as it did (DUPLICATE, NO_PROPOSAL:<reason>, UNKNOWN_REQUEST...), so a screen words it itself. */
  readonly code?: string;
  /** The run repeated a live cart: the earlier decision's id. Nothing new was decided, minted or charged. */
  readonly duplicateOf?: string;
  readonly finished: boolean;
}

/** `entries` is the real log; `shown` is what the visitor sees, which is a tampered copy during the DM7 demo. */
export interface LogState {
  readonly entries: readonly LogEntry[];
  readonly shown: readonly LogEntry[];
  readonly head: LogView["head"];
  readonly tampered: LogView["tampered"];
}

export interface BoothState {
  readonly mandate: Mandate | null;
  readonly intentText: string | null;
  readonly packet: PacketState | null;
  readonly cards: readonly CardRecord[];
  readonly log: LogState;
  readonly runs: readonly RunView[];
  readonly escalations: readonly EscalationView[];
  readonly revoked: boolean;
}

export type LocalAction =
  | { readonly type: "snapshot"; readonly snapshot: BoothSnapshot }
  | { readonly type: "log.view"; readonly view: LogView };
export type BoothAction = TraceEvent | LocalAction;

const EMPTY_LOG: LogState = { entries: [], shown: [], head: null, tampered: null };

/**
 * A fresh load. Every client's view carries the changed copy in `entries` while the tamper demo is up (the booth shares it
 * with the next visitor), so the stored log is recovered from the copy and what it says changed; `shown` is the copy itself.
 */
function logFromView(view: LogView): LogState {
  return { entries: storedEntries(view), shown: view.entries, head: view.head, tampered: view.tampered };
}

export function initialState(): BoothState {
  return { mandate: null, intentText: null, packet: null, cards: [], log: EMPTY_LOG, runs: [], escalations: [], revoked: false };
}

export function fromSnapshot(s: BoothSnapshot): BoothState {
  return {
    mandate: s.mandate,
    intentText: s.intentText,
    packet: s.packet,
    cards: s.cards,
    log: logFromView(s.log),
    runs: [],
    escalations: s.escalations,
    revoked: s.packet?.status === "REVOKED",
  };
}

function patchRun(runs: readonly RunView[], runId: string, patch: (r: RunView) => RunView): readonly RunView[] {
  return runs.map((r) => (r.runId === runId ? patch(r) : r));
}

const NEXT_CARD_STATE: Partial<Record<CardEvent["event"], CardRecord["state"]>> = { AUTHORISED: "USED", VOIDED: "VOIDED", EXPIRED: "EXPIRED" };

function applyCardEvent(cards: readonly CardRecord[], event: CardEvent): readonly CardRecord[] {
  const next = NEXT_CARD_STATE[event.event];
  return next ? cards.map((c) => (c.id === event.card_id && c.state === "ACTIVE" ? { ...c, state: next } : c)) : cards;
}

function upsertEscalation(list: readonly EscalationView[], view: EscalationView): readonly EscalationView[] {
  return list.some((e) => e.decisionId === view.decisionId) ? list.map((e) => (e.decisionId === view.decisionId ? view : e)) : [...list, view];
}

function appendLog(log: LogState, entry: LogEntry): LogState {
  // Any new entry ends a tamper demo: the copy no longer matches the log.
  const entries = [...log.entries, entry];
  return { entries, shown: entries, head: { log_id: entry.log_id, seq: entry.seq, entry_hash: entry.entry_hash }, tampered: null };
}

/** A view fetched after Tamper or Restore changes only what is shown, never the real entries. */
function showView(log: LogState, view: LogView): LogState {
  return { ...log, shown: view.entries, tampered: view.tampered };
}

function reduceRun(state: BoothState, event: Extract<TraceEvent, { runId: string }>): BoothState {
  const runs = patchRun(state.runs, event.runId, (r) => {
    switch (event.type) {
      case "stage": {
        const view: StageView = { status: event.status, ...(event.note ? { note: event.note } : {}), ...(event.latencyMs === undefined ? {} : { latencyMs: event.latencyMs }) };
        return { ...r, stages: { ...r.stages, [event.stage]: view } };
      }
      case "cart":
        return { ...r, cart: event.cart, listingText: event.listingText, ...(event.plannerNote ? { plannerNote: event.plannerNote } : {}), ...(event.planner ? { planner: event.planner } : {}) };
      case "judge":
        return { ...r, judge: event.judge };
      case "decision":
        return { ...r, decisions: [...r.decisions, event.decision] };
      case "card.minted":
        return { ...r, mintedCard: event.card };
      case "card.event":
        return { ...r, cardEvents: [...r.cardEvents, { event: event.event, beat: event.beat }] };
      case "run.finished":
        return {
          ...r,
          finished: true,
          outcome: event.outcome,
          ...(event.note ? { note: event.note } : {}),
          ...(event.code ? { code: event.code } : {}),
          ...(event.duplicateOf ? { duplicateOf: event.duplicateOf } : {}),
        };
      default:
        return r;
    }
  });
  if (event.type === "card.minted") return { ...state, runs, cards: [...state.cards, event.card] };
  if (event.type === "card.event") return { ...state, runs, cards: applyCardEvent(state.cards, event.event) };
  return { ...state, runs };
}

/** The log of the budget the state holds: the packet names it; before any packet, the newest entry or the head does. */
function logIdOf(state: BoothState): string | undefined {
  return state.packet?.log_id ?? state.log.entries.at(-1)?.log_id ?? state.log.head?.log_id;
}

/**
 * A new seal starts a new log and a new set of cards on the engine side, so the first event that names another log
 * (the log entry, the packet or the seal itself, whichever the client sends first) starts the state over: nothing of
 * the earlier budget carries over. An empty state, or one about this log already, is kept as it is.
 */
function inBudget(state: BoothState, logId: string): BoothState {
  const held = logIdOf(state);
  return held === undefined || held === logId ? state : initialState();
}

/** A question nobody answered before the budget was cancelled or ended is over: no screen should offer to answer it. */
function closeOpenQuestions(state: BoothState): BoothState {
  if (closedBudget(state) === null || !state.escalations.some((e) => e.state === "OPEN")) return state;
  return { ...state, escalations: state.escalations.map((e): EscalationView => (e.state === "OPEN" ? { ...e, state: "CLOSED" } : e)) };
}

export function reduce(state: BoothState, action: BoothAction): BoothState {
  return closeOpenQuestions(reduceAction(state, action));
}

function reduceAction(state: BoothState, action: BoothAction): BoothState {
  switch (action.type) {
    case "snapshot":
      return fromSnapshot(action.snapshot);
    case "log.view":
      return { ...state, log: showView(state.log, action.view) };
    case "reset":
      return initialState();
    case "mandate.sealed":
      return { ...inBudget(state, action.packet.log_id), mandate: action.mandate, intentText: action.mandate.intent_text, packet: action.packet, revoked: false };
    case "mandate.revoked":
      return { ...state, revoked: true };
    case "run.started":
      return { ...state, runs: [...state.runs, { runId: action.runId, scenario: action.scenario, startedAt: action.at, stages: {}, decisions: [], cardEvents: [], finished: false }] };
    case "log": {
      const base = inBudget(state, action.entry.log_id);
      return { ...base, log: appendLog(base.log, action.entry) };
    }
    case "packet":
      return { ...inBudget(state, action.packet.log_id), packet: action.packet };
    case "escalation":
      return { ...state, escalations: upsertEscalation(state.escalations, action.escalation) };
    case "stage":
    case "cart":
    case "judge":
    case "decision":
    case "card.minted":
    case "card.event":
    case "run.finished":
      return reduceRun(state, action);
  }
}

/** The run to show on the Run screen: the last one that started. */
export function currentRun(state: BoothState): RunView | undefined {
  return state.runs.at(-1);
}

export function currentDecision(run: RunView | undefined): Decision | undefined {
  return run?.decisions.at(-1);
}
