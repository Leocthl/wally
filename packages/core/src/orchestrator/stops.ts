// Budget stops the shopper can ask cheaper options for (R3, R4). The orchestrator remembers, in memory only, the
// request text and the listings of each submit that ended in such a stop, because a Decision records neither (the
// cart carries a listing url and a text hash, not the records). The log stays the only state that decides anything:
// a forgotten stop (restart, or more than MAX_REMEMBERED_STOPS newer ones) answers NOT_APPLICABLE, unless the caller
// passes the listings again.
import type { Decision, ListingRecord } from "../generated";
import type { PlannerStop } from "../ports";
import type { Ctx } from "./context";
import type { SubmitResult } from "./types";

export type BudgetStopTemplate = "R3.over_remaining" | "R4.over_cap";

/** Memory bound only, not a policy number: a stop is remembered until this many newer ones have been. */
export const MAX_REMEMBERED_STOPS = 32;

export interface StoppedRequest {
  readonly requestText: string;
  readonly listings: readonly ListingRecord[];
}

/** The template of a DENY by R3 or R4; null for anything else. */
export function budgetStopOf(decision: Decision): BudgetStopTemplate | null {
  const template = decision.explanation?.template_id;
  return decision.outcome === "DENY" && (template === "R3.over_remaining" || template === "R4.over_cap") ? template : null;
}

function capOf(decision: Decision): number | null {
  const cap = decision.rules.find((r) => r.id === "R4" && r.result === "FAIL")?.inputs["cap_minor"];
  return typeof cap === "number" && Number.isSafeInteger(cap) && cap >= 0 ? cap : null;
}

/** What the planner may spend: what is left now, and for R4 also the per-purchase cap the stop recorded. */
export function plannerStopOf(decision: Decision, template: BudgetStopTemplate, remainingMinor: number): PlannerStop {
  const cap = template === "R4.over_cap" ? capOf(decision) : null;
  return { templateId: template, remainingMinor: cap === null ? remainingMinor : Math.min(remainingMinor, cap) };
}

/** Keeps the stop of a DENY by R3 or R4 for suggestAlternatives. Anything else, and a repeat, is not remembered. */
export function rememberStop(ctx: Ctx, result: SubmitResult, request: StoppedRequest): void {
  if (!result.ok || result.outcome === "NO_PROPOSAL" || result.outcome === "INVALID_CART" || result.duplicate === true) return;
  if (budgetStopOf(result.decision) === null) return;
  const next = [...ctx.memory.stops, [result.decision.id, request] as const].slice(-MAX_REMEMBERED_STOPS);
  ctx.memory.stops = new Map(next);
}
