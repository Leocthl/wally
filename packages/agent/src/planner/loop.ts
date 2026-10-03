// The decision loop: (1) which item, (2) which variant, (3) next action, with code executing the action.
// Hard facts (quantity, stated size and colour, budget) are computed in code; Laya answers the soft
// questions. Any abstention or failure ends the loop with null so the app asks the shopper (I5).
import type { ProposeCartInput } from "@wally/core/ports";
import { groupFamilies, type PlannerCandidate } from "./candidates";
import { decideAction, decideItem, decideVariant, type DecisionContext } from "./decisions";
import { parseQuantity } from "./parse-request";
import { buildProposal, estimateTotalMinor } from "./proposal";
import { NEXT_ACTION } from "./questions";

/** Words of the item name, so "2 cotton tees" counts as a quantity for a cotton tee. */
function nounsOf(candidate: PlannerCandidate): readonly string[] {
  return candidate.baseName.toLowerCase().match(/[a-z]{3,}/g) ?? [];
}

/** Numbers that belong to the title ("3 pairs") are a pack size, not a quantity. */
function packPhrases(candidate: PlannerCandidate): readonly string[] {
  return (candidate.title.toLowerCase().match(/\d+\s+[a-z]+/g) ?? []).map((p) => p.replace(/\s+/g, " "));
}

/** Quantity for this candidate: 1 unless the request states one; null when the request's number cannot be used. */
function quantityFor(request: string, candidate: PlannerCandidate): number | null {
  const parsed = parseQuantity(request, nounsOf(candidate), packPhrases(candidate));
  if (parsed.kind === "invalid") return null;
  return parsed.kind === "qty" ? parsed.qty : 1;
}

function fitting(request: string, candidates: readonly PlannerCandidate[], budgetMinor: number): readonly PlannerCandidate[] {
  return candidates.filter((c) => {
    const qty = quantityFor(request, c);
    return qty !== null && estimateTotalMinor(c, qty) <= budgetMinor;
  });
}

/**
 * Runs the loop once. `budgetMinor` is set only after a budget stop (alternatives): then the replan is
 * executed by code first (candidates that cannot fit are dropped) and Laya picks the closest substitute.
 */
export async function runLoop(
  ctx: DecisionContext,
  candidates: readonly PlannerCandidate[],
  budgetMinor: number | null,
): Promise<ProposeCartInput | null> {
  const pool = budgetMinor === null ? candidates : fitting(ctx.request, candidates, budgetMinor);
  if (budgetMinor !== null) ctx.tracer.emitForced(`${NEXT_ACTION}_forced`, pool.length > 0 ? "replan_cheaper" : "give_up");
  const families = groupFamilies(pool);
  if (families.length === 0) return null;

  const item = await decideItem(ctx, families, budgetMinor !== null);
  if (item.kind !== "chosen") return null;
  const variant = await decideVariant(ctx, item.value);
  if (variant.kind !== "chosen") return null;

  const chosen = variant.value.candidate;
  const qty = quantityFor(ctx.request, chosen);
  if (qty === null) return null;
  if (budgetMinor !== null && estimateTotalMinor(chosen, qty) > budgetMinor) return null;

  const action = await decideAction(ctx, chosen, variant.value.note);
  if (action.kind !== "chosen") return null;
  return buildProposal(chosen, qty, budgetMinor === null ? "Closest listed item to the request" : "Closest cheaper item to the request");
}
