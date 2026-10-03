// Turns engine Decisions, judge records and rail events into the plain summaries RunOutcome carries.
import type { Decision, RuleId, RuleResult, TemplateId } from "@wally/core/generated";
import type { CardEvent, JudgeRecord } from "@wally/core/ports";
import type { DecisionOutcome } from "../types";
import type { EventSummary, JudgeSummary } from "./types";

export interface Folded {
  readonly outcome: DecisionOutcome;
  readonly primary: RuleResult | null;
}

/** Outcome of the rule results that `include` keeps: any DENY, else any ESCALATE, else APPROVE (docs/02 §7). */
export function foldRules(rules: readonly RuleResult[], include: (id: RuleId) => boolean): Folded {
  const fails = rules.filter((r) => r.result === "FAIL" && include(r.id));
  const deny = fails.find((r) => r.verdict === "DENY");
  if (deny) return { outcome: "DENY", primary: deny };
  const escalate = fails.find((r) => r.verdict === "ESCALATE");
  return escalate ? { outcome: "ESCALATE", primary: escalate } : { outcome: "APPROVE", primary: null };
}

export function ruleOfTemplate(template: TemplateId | undefined): RuleId | null {
  const id = template?.split(".")[0];
  return id === undefined ? null : (id as RuleId);
}

export interface DecisionFacts {
  readonly outcome: DecisionOutcome;
  readonly rule: RuleId | null;
  readonly templateId: TemplateId | null;
  readonly decisionId: string;
}

/** Facts of an engine Decision as the engine itself reports them. */
export function factsOf(decision: Decision): DecisionFacts {
  const primary = foldRules(decision.rules, () => true).primary;
  const template = decision.explanation?.template_id ?? primary?.template_id ?? null;
  return { outcome: decision.outcome, rule: decision.outcome === "APPROVE" ? null : (primary?.id ?? ruleOfTemplate(template ?? undefined)), templateId: decision.outcome === "APPROVE" ? null : template, decisionId: decision.id };
}

export function injectionCheckOf(decision: Decision | null): JudgeSummary["injectionCheck"] {
  const r = decision?.rules.find((x) => x.id === "R10" && x.check === "injection_risk");
  return r?.result === "PASS" || r?.result === "FAIL" ? r.result : "ABSENT";
}

export function summariseJudge(record: JudgeRecord, decision: Decision | null): JudgeSummary {
  const a = record.answers;
  return {
    provider: record.provider,
    status: record.status,
    inputTruncated: record.input_truncated === true,
    latencyMs: record.latency_ms,
    ...(a === undefined ? {} : { answers: { injection_risk: a.injection_risk, scope_fit: a.scope_fit, seller_risk: a.seller_risk } }),
    injectionCheck: injectionCheckOf(decision),
  };
}

export const summariseEvent = (e: CardEvent): EventSummary => ({
  event: e.event,
  amountMinor: e.amount_minor ?? null,
  merchantDomain: e.merchant_domain ?? null,
  declineCode: e.decline_code ?? null,
});
