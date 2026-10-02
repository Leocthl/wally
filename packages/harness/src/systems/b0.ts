// B0: the model-only gate. Laya answers budget_fit {within_budget, over_budget} and the four judge questions in one call
// and its answers are trusted as they stand: the argmax of each question, no thresholds, no arithmetic, no rules, no seller
// check, no truncation check. The card it mints has no limit tied to the purchase (it is set to the per-card ceiling [F1.ceiling]),
// and nothing re-quotes at checkout, collapses a repeated cart or voids a card on revoke. Single-use, the SIMULATED merchant lock and
// idempotency keys belong to the rail instrument, so they stay. Each of these choices is listed under "definitions" in the result file.
import type { Decision } from "@laisee/core/generated";
import { RAIL, TIMEOUTS_MS } from "../config";
import { argmax, type ChoiceAnswer, type ChoiceClient, type ChoiceRequest } from "../judge/choice-client";
import { BUDGET_FIT_QUESTION, JUDGE_QUESTIONS, PROCEED_CHOICE } from "../judge/questions";
import { budgetFacts, listingState } from "../judge/state";
import type { Scenario } from "../types";
import type { Gate, GateDecision } from "./pipeline";
import type { JudgeSummary, SystemDeps } from "./types";

export const B0_QUESTION_IDS = ["budget_fit", "scope_fit", "injection_risk", "seller_risk", "escalate_or_proceed"] as const;

export function modelGateRequest(s: Scenario): ChoiceRequest {
  return {
    state: {
      mandate: s.mandate.intent_text,
      budget: budgetFacts(s.mandate, s.packet, s.cart),
      listing: listingState(s.cart, s.listing.text),
    },
    questions: [BUDGET_FIT_QUESTION, ...JUDGE_QUESTIONS],
  };
}

type Answers = Readonly<Record<string, ChoiceAnswer>>;

/** Trusts the argmax of every question. All five say proceed: APPROVE; only "escalate" dissents: ESCALATE; anything else: DENY. */
export function trustedOutcome(answers: Answers): "APPROVE" | "DENY" | "ESCALATE" {
  const dissent = B0_QUESTION_IDS.filter((id) => (answers[id] === undefined ? true : argmax(answers[id].probabilities) !== PROCEED_CHOICE[id]));
  if (dissent.length === 0) return "APPROVE";
  return dissent.length === 1 && dissent[0] === "escalate_or_proceed" ? "ESCALATE" : "DENY";
}

/** Record handed to the rail. The model gate produces no engine Decision, so this one says what it is. */
function gateDecision(s: Scenario, id: string): Decision {
  return {
    id,
    mandate_id: s.mandate.id,
    cart: s.cart,
    decided_at: s.now,
    outcome: "APPROVE",
    approved_limit_minor: RAIL.ceilingMinor,
    packet: s.packet,
    rules: [{ id: "R10", check: "budget_fit", result: "PASS", comparator: "==", inputs: { source: "B0 model gate, answer trusted" } }],
    judge: { provider: "replay", model: "b0-model-gate", version: "b0", status: "OK", latency_ms: 0, shadow: false },
    engine: { version: "harness-b0-model-gate", config_sha256: "0".repeat(64) },
  };
}

function summary(result: Awaited<ReturnType<ChoiceClient["ask"]>>): JudgeSummary {
  if (!result.ok) return { provider: "b0", status: result.status, inputTruncated: false, latencyMs: result.latencyMs, injectionCheck: "ABSENT" };
  const p = (id: string): Readonly<Record<string, number>> => result.answers[id]?.probabilities ?? {};
  return {
    provider: "b0",
    status: "OK",
    inputTruncated: result.truncated,
    latencyMs: result.latencyMs,
    answers: { injection_risk: p("injection_risk"), scope_fit: p("scope_fit"), seller_risk: p("seller_risk") },
    injectionCheck: "ABSENT",
  };
}

export function createB0Gate(deps: Pick<SystemDeps, "choiceFor">): Gate {
  return {
    async decide(s: Scenario, submission: number): Promise<GateDecision> {
      const result = await deps.choiceFor(s).ask(modelGateRequest(s), { timeoutMs: TIMEOUTS_MS.judge });
      // The model is unreachable: a gate that cannot ask cannot approve. B0 keeps that much of I5.
      const outcome = result.ok ? trustedOutcome(result.answers) : "ESCALATE";
      const id = `dec_${s.cart.id.slice("crt_".length)}b0s${submission}`;
      return {
        facts: { outcome, rule: null, templateId: null, decisionId: id },
        forRail: outcome === "APPROVE" ? gateDecision(s, id) : null,
        judge: summary(result),
      };
    },
  };
}
