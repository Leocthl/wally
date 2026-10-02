// Applying a delegator's answer (consent by escalation). Only ESCALATE verdicts are answerable
// (R4 ask_above, R9 unverified, R10); DENY verdicts, which include every hard rule R1-R8 and R12,
// stay DENY whatever the answer. APPROVE clears an answerable FAIL to PASS (recorded as cleared by the
// delegator); DENY turns it into a DENY that reuses the escalating rule's template (docs/02 section 8).
import { THRESHOLD_REFS } from "../config";
import type { Decision, Escalation, EscalationAnswer, RuleResult } from "../generated";
import { failed, passed, type R11Outcome } from "../rules";

function answered(rule: RuleResult, answer: EscalationAnswer): RuleResult {
  if (rule.result !== "FAIL" || rule.verdict !== "ESCALATE" || rule.comparator === undefined) return rule;
  const base = { id: rule.id, inputs: rule.inputs, comparator: rule.comparator };
  const spec = {
    ...base,
    ...(rule.check === undefined ? {} : { check: rule.check }),
    ...(rule.threshold_ref === undefined ? {} : { thresholdRef: rule.threshold_ref }),
  };
  if (answer.choice === "APPROVE") {
    return passed({ ...spec, inputs: { ...rule.inputs, cleared_by: "delegator", answer_decision_id: answer.decision_id } });
  }
  return rule.template_id === undefined ? rule : failed({ ...spec, inputs: { ...rule.inputs, delegator_answer: "DENY" } }, "DENY", rule.template_id);
}

/** R1..R10 after the answer, then R11. A DENY answer with nothing left to deny is recorded on R11. */
export function resolveRules(base: readonly RuleResult[], r11: R11Outcome): RuleResult[] {
  const answer = r11.answer;
  if (answer === null) return [...base, r11.result];
  const after = base.map((r) => answered(r, answer));
  const deniedSomething = base.some((r) => r.result === "FAIL" && r.verdict === "ESCALATE");
  if (answer.choice === "DENY" && !deniedSomething) {
    const inputs = { ...r11.result.inputs, choice: "DENY" };
    return [...after, failed({ id: "R11", inputs, comparator: "<", thresholdRef: THRESHOLD_REFS.escalation_window }, "DENY", "R11.expired")];
  }
  return [...after, r11.result];
}

/** Final escalation block on the decision that resolves an earlier ESCALATE; undefined if none was open. */
export function resolvedEscalation(r11: R11Outcome, outcome: Decision["outcome"]): Escalation | undefined {
  if (r11.expiresAt === null) return undefined;
  if (r11.answer === null) return { state: r11.windowPassed ? "EXPIRED" : "DENIED", expires_at: r11.expiresAt };
  return { state: outcome === "APPROVE" ? "APPROVED" : "DENIED", expires_at: r11.expiresAt, answer: r11.answer };
}
