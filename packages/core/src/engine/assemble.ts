// Outcome, primary reason, explanation and the Decision object (decision.schema.json).
// Outcome = any DENY, else any ESCALATE, else APPROVE. Primary reason = first FAIL in rule order whose
// verdict equals the outcome (docs/02 section 8). approved_limit_minor = cart total on APPROVE only (I2).
import type { Cart, Decision, Escalation, Mandate, PacketState, RuleResult } from "../generated";
import { renderBoth } from "../explain";
import type { JudgeRecord, TemplateId } from "../ports";
import { decisionId, isDecisionId, type DecisionPhase } from "./ids";

type FailedRule = RuleResult & { readonly result: "FAIL"; readonly verdict: "DENY" | "ESCALATE"; readonly template_id: TemplateId };

function isFail(r: RuleResult, verdict: "DENY" | "ESCALATE"): r is FailedRule {
  return r.result === "FAIL" && r.verdict === verdict && r.template_id !== undefined;
}

/** The primary failing rule, or undefined when the outcome is APPROVE. */
export function primaryReason(rules: readonly RuleResult[]): FailedRule | undefined {
  return rules.find((r) => isFail(r, "DENY")) ?? rules.find((r) => isFail(r, "ESCALATE"));
}

export function outcomeOf(rules: readonly RuleResult[]): Decision["outcome"] {
  return primaryReason(rules)?.verdict ?? "APPROVE";
}

function explanationOf(primary: FailedRule): NonNullable<Decision["explanation"]> {
  const inputs = { ...primary.inputs, verdict: primary.verdict };
  const lines = renderBoth(primary.template_id, inputs);
  return { template_id: primary.template_id, inputs, rendered: lines.en, rendered_zh_hk: lines.zhHK };
}

export interface DecisionParts {
  readonly phase: DecisionPhase;
  readonly mandate: Mandate;
  readonly packet: PacketState;
  readonly cart: Cart;
  readonly judge: JudgeRecord;
  readonly decidedAt: string;
  readonly rules: readonly RuleResult[];
  readonly resolves?: string;
  /** Escalation block to record; for a fresh ESCALATE the caller passes the OPEN window. */
  readonly escalation?: Escalation;
  readonly engine: Decision["engine"];
}

function nonEmpty(rules: readonly RuleResult[]): Decision["rules"] {
  const [first, ...rest] = rules;
  if (first === undefined) throw new TypeError("a decision needs at least one rule result");
  return [first, ...rest];
}

/** Builds the Decision with a fixed key order so identical inputs serialise byte for byte the same. */
export function assembleDecision(parts: DecisionParts): Decision {
  const primary = primaryReason(parts.rules);
  const outcome = primary?.verdict ?? "APPROVE";
  const resolves = isDecisionId(parts.resolves) ? parts.resolves : undefined;
  return {
    id: decisionId(parts.cart.id, parts.decidedAt, resolves, parts.phase),
    mandate_id: parts.mandate.id,
    cart: parts.cart,
    decided_at: parts.decidedAt,
    outcome,
    ...(outcome === "APPROVE" ? { approved_limit_minor: parts.cart.total_minor } : {}),
    packet: parts.packet,
    rules: nonEmpty(parts.rules),
    judge: parts.judge,
    ...(primary === undefined ? {} : { explanation: explanationOf(primary) }),
    ...(resolves === undefined ? {} : { resolves }),
    ...(parts.escalation === undefined ? {} : { escalation: parts.escalation }),
    engine: parts.engine,
  };
}
