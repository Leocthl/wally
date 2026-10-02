// The planner call path (I4). This module imports ports and generated types only: no crypto, log, vc, rail or
// executor, so nothing secret can reach the planner. The planner gets the shopper's request and the listing urls;
// listing text is withheld (it goes to the judge, docs/02 sequence S3). Any fault or timeout is no proposal (I5).
import type { ListingRecord } from "../generated";
import type { PlannerContext, PlannerPort, PlannerStop, PlannerTraceStep, ProposeCartInput } from "../ports";
import type { NoProposalReason, PlannerFactory } from "./types";

export type PlanOutcome =
  | { readonly proposal: ProposeCartInput; readonly latencyMs: number }
  | { readonly proposal: null; readonly reason: NoProposalReason; readonly latencyMs: number };

export interface PlanInput {
  readonly factory: PlannerFactory;
  readonly listings: readonly ListingRecord[];
  readonly requestText: string;
  readonly timeoutMs: number;
  readonly onStep: (step: PlannerTraceStep) => void;
  /** Set after a budget stop: the planner is asked for alternatives instead of a first proposal. */
  readonly stop?: PlannerStop;
}

const TIMED_OUT = Symbol("planner timeout");

function plannerContext(input: PlanInput): PlannerContext {
  return { intentText: input.requestText, listings: input.listings.map((l) => ({ url: l.url, text: "" })) };
}

function withDeadline<T>(work: Promise<T>, timeoutMs: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

async function callPlanner(planner: PlannerPort, input: PlanInput, live: { on: boolean }): Promise<ProposeCartInput | null | typeof TIMED_OUT> {
  const onTrace = (step: PlannerTraceStep): void => {
    if (live.on) input.onStep(step); // steps after the deadline are dropped
  };
  const ctx = plannerContext(input);
  const opts = { timeoutMs: input.timeoutMs, onTrace };
  const pending = input.stop === undefined ? planner.propose(ctx, opts) : (planner.alternatives?.(ctx, input.stop, opts) ?? Promise.resolve(null));
  return withDeadline(pending, input.timeoutMs);
}

export async function plan(input: PlanInput): Promise<PlanOutcome> {
  const started = performance.now();
  const latency = (): number => Math.round(performance.now() - started);
  const live = { on: true };
  try {
    const result = await callPlanner(input.factory(input.listings), input, live);
    live.on = false;
    if (result === TIMED_OUT) return { proposal: null, reason: "planner_timeout", latencyMs: latency() };
    if (result !== null) return { proposal: result, latencyMs: latency() };
    return { proposal: null, reason: input.stop === undefined ? "planner_null" : "no_alternative", latencyMs: latency() };
  } catch {
    live.on = false;
    return { proposal: null, reason: "planner_error", latencyMs: latency() }; // a planner that throws broke its port contract
  }
}
