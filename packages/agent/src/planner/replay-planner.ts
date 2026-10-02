// PLANNER_PROVIDER=replay: recorded planner outputs (CI and the booth fallback, no network, no Laya).
// A record is chosen by scenario id, or by the set of listing ids in the context. The proposal is re-checked
// before it is returned (schema, listing url among those given, titles from the listing record), because a
// recorded file is as untrusted as any other planner output. Never throws; null on any doubt (I5).
import type { ListingRecord, PlannerReplayRecord } from "@laisee/core/generated";
import type { PlannerContext, PlannerOptions, PlannerPort, PlannerStop, PlannerTraceStep, ProposeCartInput } from "@laisee/core/ports";
import { validateProposeCartInput } from "@laisee/core/schema";

export { loadReplayRecords } from "./replay-store";

/** A record whose scenario id ends like this answers `alternatives` after a budget stop; the others answer `propose`. */
export const ALTERNATIVE_SUFFIX = "-alternative";

const BUDGET_STOPS: ReadonlySet<string> = new Set(["R3.over_remaining", "R4.over_cap"]);

export interface ReplayPlannerOptions {
  readonly records: readonly PlannerReplayRecord[];
  /** Listing records: maps context urls to listing ids and lets the proposal's titles be checked. */
  readonly catalogue?: readonly ListingRecord[];
  /** Fixed scenario id. Without it the record is chosen by the listing ids of the context (needs the catalogue). */
  readonly scenario?: string;
  /** Recorded request per scenario id. When a scenario has one, the context's request must match it (case and spacing ignored). */
  readonly requestsByScenario?: Readonly<Record<string, string>>;
}

const normaliseRequest = (text: string): string => text.trim().replace(/\s+/g, " ").toLowerCase();
const isAlternative = (r: PlannerReplayRecord): boolean => r.scenario.endsWith(ALTERNATIVE_SUFFIX);
const round4 = (x: number): number => Math.round(x * 10_000) / 10_000;

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function contextListingIds(ctx: PlannerContext, byUrl: ReadonlyMap<string, ListingRecord>): readonly string[] | null {
  const ids = ctx.listings.flatMap((l) => {
    const id = byUrl.get(l.url)?.id;
    return id === undefined ? [] : [id];
  });
  return ids.length === 0 || ids.length !== ctx.listings.length ? null : [...new Set(ids)];
}

function select(
  options: ReplayPlannerOptions,
  ctx: PlannerContext,
  byUrl: ReadonlyMap<string, ListingRecord>,
  alternative: boolean,
): PlannerReplayRecord | null {
  if (options.scenario !== undefined) {
    const wanted = alternative ? `${options.scenario}${ALTERNATIVE_SUFFIX}` : options.scenario;
    return options.records.find((r) => r.scenario === wanted) ?? null;
  }
  const ids = contextListingIds(ctx, byUrl);
  if (ids === null) return null;
  const matches = options.records.filter((r) => isAlternative(r) === alternative && sameSet(r.listing_ids, ids));
  const [first] = matches;
  if (first === undefined) return null;
  return matches.every((m) => JSON.stringify(m.proposal) === JSON.stringify(first.proposal)) ? first : null;
}

function requestMatches(options: ReplayPlannerOptions, record: PlannerReplayRecord, ctx: PlannerContext): boolean {
  const base = isAlternative(record) ? record.scenario.slice(0, -ALTERNATIVE_SUFFIX.length) : record.scenario;
  const recorded = options.requestsByScenario?.[base];
  return recorded === undefined || normaliseRequest(recorded) === normaliseRequest(ctx.intentText);
}

function acceptable(proposal: ProposeCartInput, ctx: PlannerContext, byUrl: ReadonlyMap<string, ListingRecord>): boolean {
  if (!validateProposeCartInput(proposal).ok) return false;
  if (!ctx.listings.some((l) => l.url === proposal.listing_url)) return false;
  if (byUrl.size === 0) return true;
  const listing = byUrl.get(proposal.listing_url);
  return listing !== undefined && proposal.items.every((i) => listing.items.some((x) => x.title === i.title));
}

function traceStepOf(record: PlannerReplayRecord): PlannerTraceStep | null {
  const trace = record.trace;
  if (trace === undefined) return null;
  const entries = Object.entries(trace.probabilities).flatMap(([label, p]) => (typeof p === "number" ? [[label, p] as const] : []));
  const [top, second] = [...entries].sort((a, b) => b[1] - a[1]);
  if (top === undefined) return null;
  return {
    step: 1,
    question: trace.question,
    choice: trace.choice ?? top[0],
    probabilities: Object.fromEntries(entries),
    margin: round4(top[1] - (second?.[1] ?? 0)),
  };
}

function report(onTrace: PlannerOptions["onTrace"], step: PlannerTraceStep | null): void {
  if (onTrace === undefined || step === null) return;
  try {
    onTrace(step);
  } catch {
    // The trace is display only: a failing callback must never change what the planner returns.
  }
}

export function createReplayPlanner(options: ReplayPlannerOptions): PlannerPort {
  const byUrl: ReadonlyMap<string, ListingRecord> = new Map((options.catalogue ?? []).map((r) => [r.url, r] as const));

  function replay(ctx: PlannerContext, opts: PlannerOptions, alternative: boolean): Promise<ProposeCartInput | null> {
    try {
      if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) return Promise.resolve(null);
      const record = select(options, ctx, byUrl, alternative);
      if (record === null || !requestMatches(options, record, ctx)) return Promise.resolve(null);
      if (record.proposal !== null && !acceptable(record.proposal, ctx, byUrl)) return Promise.resolve(null);
      report(opts.onTrace, traceStepOf(record));
      return Promise.resolve(record.proposal === null ? null : structuredClone(record.proposal));
    } catch {
      return Promise.resolve(null); // never throws
    }
  }

  return {
    propose: (ctx, opts) => replay(ctx, opts, false),
    alternatives: (ctx: PlannerContext, stop: PlannerStop, opts: PlannerOptions) =>
      BUDGET_STOPS.has(stop.templateId) ? replay(ctx, opts, true) : Promise.resolve(null),
  };
}
