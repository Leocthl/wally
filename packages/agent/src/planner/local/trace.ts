// One PlannerTraceStep per local planner call: source "generative", the chosen title (or the action, or
// no_answer) as the choice, no probabilities and margin 0 (a generative answer carries none), and the latency.
import type { PlannerOptions } from "@wally/core/ports";

export const LOCAL_PLAN_QUESTION = "local_plan";
export const LOCAL_ALTERNATIVES_QUESTION = "local_alternatives";

export function emitStep(onTrace: PlannerOptions["onTrace"], question: string, choice: string, latencyMs: number): void {
  if (onTrace === undefined) return;
  try {
    onTrace({ step: 1, question, choice, probabilities: {}, margin: 0, source: "generative", latencyMs });
  } catch {
    // The trace is display only: a failing callback must never change what the planner returns.
  }
}
