// Trace reporting: every typed decision goes to opts.onTrace as one PlannerTraceStep.
import type { PlannerTraceStep } from "@wally/core/ports";

export interface Tracer {
  /** Number of decisions reported so far; the step cap reads this. */
  readonly count: () => number;
  /** A decision Laya answered. */
  readonly emit: (question: string, choice: string, probabilities: Readonly<Record<string, number>>, margin: number) => void;
  /** A decision the code made because only one action or variant was legal; probability 1 by construction. */
  readonly emitForced: (question: string, choice: string) => void;
}

export function createTracer(onTrace: ((step: PlannerTraceStep) => void) | undefined): Tracer {
  let steps = 0;
  const report = (question: string, choice: string, probabilities: Readonly<Record<string, number>>, margin: number): void => {
    steps += 1;
    if (onTrace === undefined) return;
    try {
      onTrace({ step: steps, question, choice, probabilities, margin });
    } catch {
      // The trace is display only: a failing callback must never change what the planner returns.
    }
  };
  return {
    count: () => steps,
    emit: report,
    emitForced: (question, choice) => report(question, choice, { [choice]: 1 }, 1),
  };
}
