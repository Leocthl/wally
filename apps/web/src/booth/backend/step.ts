// What one orchestrator operation means for a booth run: a Step (outcome, decision, plain note, stable code) built from
// a SubmitResult or a CheckoutResult. Notes are plain English from recorded facts; a screen words them in its own
// language from `code`. Nothing here decides anything.
import type { CardView, CheckoutResult, NoProposalReason, SubmitResult } from "@wally/core/orchestrator";
import type { RunOutcome } from "../../api/types";

export interface Step {
  readonly outcome: RunOutcome;
  readonly decisionId?: string;
  readonly note?: string;
  readonly code?: string;
  readonly duplicate?: true;
  readonly alternativeTo?: string;
}

export interface Bought extends Step {
  readonly card: CardView | null;
}

/** Scenario buttons: the planner made no proposal, with the reason spelled out for the presenter. */
export function submitStep(result: SubmitResult): Bought {
  if (!result.ok) return { outcome: "ERROR", card: null, note: `${result.code}: ${result.message}`, ...(result.decision ? { decisionId: result.decision.id } : {}) };
  if (result.outcome === "NO_PROPOSAL") {
    return { outcome: "INFO", card: null, note: `The planner made no proposal (${result.reason}): it asks the shopper. Nothing was decided and no card exists.` };
  }
  if (result.outcome === "INVALID_CART") return { outcome: "ERROR", card: null, note: `The cart could not be built (${result.code}); no decision, no card.` };
  return { outcome: result.outcome, decisionId: result.decision.id, card: result.card };
}

export function checkoutStep(result: CheckoutResult): Step {
  if (!result.ok) return { outcome: "ERROR", note: `${result.code}: ${result.message}` };
  if (result.status === "DRIFT") return { outcome: "DENY", decisionId: result.decision.id };
  if (result.status === "TIMEOUT") return { outcome: "INFO", note: "Every merchant call timed out; the same key is kept, so a retry can never charge twice." };
  return { outcome: "APPROVE" };
}

const NO_PROPOSAL_NOTES: Readonly<Record<NoProposalReason, string>> = {
  planner_null: "Wally could not tell which item you meant, so it is asking you. Nothing was decided and no card was made.",
  planner_timeout: "The planner did not answer in time. Nothing was decided and no card was made.",
  planner_error: "The planner failed. Nothing was decided and no card was made.",
  no_alternative: "No cheaper option fits what is left. Nothing was decided and no card was made.",
};

const DUPLICATE_NOTE = "Wally already decided this exact purchase, so it returned that decision. Nothing new was decided, bought or charged.";
const DUPLICATE_ESCALATION_NOTE = "Wally already asked you about this exact purchase and is waiting for your answer. Nothing new was decided.";

/** Ask Wally and "See cheaper options": the whole request is one orchestrator call, with the checkout inside it. */
export function askStep(result: SubmitResult): Step {
  if (!result.ok) return { outcome: "ERROR", code: result.code, note: `${result.code}: ${result.message}`, ...(result.decision ? { decisionId: result.decision.id } : {}) };
  const origin = result.alternativeTo === undefined ? {} : { alternativeTo: result.alternativeTo };
  if (result.outcome === "NO_PROPOSAL") return { outcome: "INFO", code: `NO_PROPOSAL:${result.reason}`, note: NO_PROPOSAL_NOTES[result.reason], ...origin };
  if (result.outcome === "INVALID_CART") {
    return { outcome: "ERROR", code: `INVALID_CART:${result.code}`, note: `The cart could not be built (${result.code}); no decision, no card.`, ...origin };
  }
  const repeat = result.duplicate === true ? { duplicate: true as const, code: "DUPLICATE", note: result.outcome === "ESCALATE" ? DUPLICATE_ESCALATION_NOTE : DUPLICATE_NOTE } : {};
  const decided: Step = { outcome: result.outcome, decisionId: result.decision.id, ...repeat, ...origin };
  const paid = result.checkout === null ? null : checkoutStep(result.checkout);
  if (paid === null || paid.outcome === "APPROVE") return decided;
  const decisionId = paid.decisionId ?? decided.decisionId;
  return { ...decided, ...paid, ...(decisionId === undefined ? {} : { decisionId }) };
}
