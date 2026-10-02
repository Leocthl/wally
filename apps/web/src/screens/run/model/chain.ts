// One purchase = one chain of decisions: the proposal's decision first, then the decisions that resolve it (your
// answer, R11 on expiry, R12 at checkout), linked by `resolves`. The signed log is the index, so a decision from an
// earlier visit (snapshot) and one from a live run look the same. Pure: no React, no clock.
import type { CardRecord, Decision, EscalationView, LogEntry } from "../../../api/types";
import type { BoothState, RunView } from "../../../state/booth";

export interface Chain {
  /** The proposal's decision. */
  readonly root: Decision;
  /** Root first, then every decision that resolves it, in log order. */
  readonly decisions: readonly Decision[];
  /** The decision that holds now (the last one). */
  readonly current: Decision;
}

function decisionIn(entry: LogEntry): Decision | undefined {
  return entry.kind === "DECISION" ? (entry.payload as Decision) : undefined;
}

/** Every decision the booth knows, in log order; live run decisions not yet in the log come last. */
export function knownDecisions(state: BoothState): readonly Decision[] {
  const fromLog = state.log.entries.flatMap((e) => {
    const d = decisionIn(e);
    return d ? [d] : [];
  });
  const seen = new Set(fromLog.map((d) => d.id));
  const fromRuns = state.runs.flatMap((r) => r.decisions).filter((d) => !seen.has(d.id));
  return [...fromLog, ...fromRuns];
}

const MAX_DEPTH = 16;

function rootOf(byId: ReadonlyMap<string, Decision>, decision: Decision, depth = 0): Decision {
  const parent = decision.resolves === undefined ? undefined : byId.get(decision.resolves);
  return parent && depth < MAX_DEPTH ? rootOf(byId, parent, depth + 1) : decision;
}

function withDescendants(all: readonly Decision[], ids: ReadonlySet<string>): ReadonlySet<string> {
  const next = all.filter((d) => d.resolves !== undefined && ids.has(d.resolves) && !ids.has(d.id));
  return next.length === 0 ? ids : withDescendants(all, new Set([...ids, ...next.map((d) => d.id)]));
}

/** The chain any decision id belongs to (a root or a resolution), or undefined when the id is unknown. */
export function chainOf(all: readonly Decision[], id: string): Chain | undefined {
  const byId = new Map(all.map((d) => [d.id, d] as const));
  const hit = byId.get(id);
  if (!hit) return undefined;
  const root = rootOf(byId, hit);
  const ids = withDescendants(all, new Set([root.id]));
  const decisions = all.filter((d) => ids.has(d.id));
  return { root, decisions, current: decisions.at(-1) ?? root };
}

export function chainIds(chain: Chain): ReadonlySet<string> {
  return new Set(chain.decisions.map((d) => d.id));
}

/** The newest card minted for any decision of the chain, in its current state. */
export function cardOf(state: BoothState, chain: Chain): CardRecord | undefined {
  const ids = chainIds(chain);
  return state.cards.filter((c) => ids.has(c.decision_id)).at(-1);
}

export function escalationOf(state: BoothState, chain: Chain): EscalationView | undefined {
  const ids = chainIds(chain);
  return state.escalations.filter((e) => ids.has(e.decisionId)).at(-1);
}

/** True when the run produced a decision of the chain or touched its card. */
export function runInvolves(run: RunView, chain: Chain, card: CardRecord | undefined): boolean {
  const ids = chainIds(chain);
  if (run.decisions.some((d) => ids.has(d.id))) return true;
  if (!card) return false;
  return run.mintedCard?.id === card.id || run.cardEvents.some((e) => e.event.card_id === card.id);
}

/** The card a run used without deciding anything itself (pay, overshoot, replay, wrong shop, timeout). */
export function cardUsedBy(state: BoothState, run: RunView): CardRecord | undefined {
  const id = run.mintedCard?.id ?? run.cardEvents.at(-1)?.event.card_id;
  return id === undefined ? undefined : state.cards.find((c) => c.id === id);
}

/** The signed log's sequence number for a decision (its receipt number), when the log holds it. */
export function logSeqOf(state: BoothState, decisionId: string): number | undefined {
  return state.log.entries.find((e) => decisionIn(e)?.id === decisionId)?.seq;
}
