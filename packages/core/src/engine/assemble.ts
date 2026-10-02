// Outcome, primary reason, explanation and the Decision object (decision.schema.json).
// Outcome = any DENY, else any ESCALATE, else APPROVE. Primary reason = first FAIL in rule order whose
// verdict equals the outcome (docs/02 section 8). approved_limit_minor = cart total on APPROVE only (I2).
// Fail closed: a FAIL whose verdict is missing or unknown, or a result that is neither PASS, FAIL nor SKIPPED,
// counts as DENY (audit LOW); it can never read as APPROVE.
import type { Cart, Decision, Escalation, Mandate, PacketState, RuleResult } from "../generated";
import { renderBoth } from "../explain";
import type { JudgeRecord, TemplateId } from "../ports";
import { decisionId, isDecisionId, type DecisionPhase } from "./ids";

type Verdict = "DENY" | "ESCALATE";
type FailedRule = RuleResult & { readonly result: "FAIL"; readonly verdict: Verdict; readonly template_id: TemplateId };

/** The verdict a rule result stands for: null for PASS and SKIPPED, ESCALATE only for a FAIL that says so, else DENY. */
function verdictOf(r: RuleResult): Verdict | null {
  const result: unknown = r.result;
  if (result === "PASS" || result === "SKIPPED") return null;
  return result === "FAIL" && r.verdict === "ESCALATE" ? "ESCALATE" : "DENY";
}

export function outcomeOf(rules: readonly RuleResult[]): Decision["outcome"] {
  const verdicts = rules.map(verdictOf);
  if (verdicts.includes("DENY")) return "DENY";
  return verdicts.includes("ESCALATE") ? "ESCALATE" : "APPROVE";
}

/** The primary failing rule (verdict normalised as in outcomeOf), or undefined when the outcome is APPROVE or no FAIL carries a template. */
export function primaryReason(rules: readonly RuleResult[]): FailedRule | undefined {
  const outcome = outcomeOf(rules);
  if (outcome === "APPROVE") return undefined;
  const rule = rules.find((r) => verdictOf(r) === outcome && r.template_id !== undefined);
  return rule === undefined || rule.template_id === undefined ? undefined : { ...rule, result: "FAIL", verdict: outcome, template_id: rule.template_id };
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

/** A stop must cite a rule template (decision.schema.json); a malformed FAIL with none fails the decide (I5). */
function explanationFor(outcome: Decision["outcome"], rules: readonly RuleResult[]): Decision["explanation"] | undefined {
  if (outcome === "APPROVE") return undefined;
  const primary = primaryReason(rules);
  if (primary === undefined) throw new TypeError(`a ${outcome} needs a failing rule with a template`);
  return explanationOf(primary);
}

/** Builds the Decision with a fixed key order so identical inputs serialise byte for byte the same. */
export function assembleDecision(parts: DecisionParts): Decision {
  const outcome = outcomeOf(parts.rules);
  const explanation = explanationFor(outcome, parts.rules);
  const resolves = isDecisionId(parts.resolves) ? parts.resolves : undefined;
  return {
    id: decisionId({ cart: parts.cart, decidedAt: parts.decidedAt, resolves, phase: parts.phase, outcome }),
    mandate_id: parts.mandate.id,
    cart: parts.cart,
    decided_at: parts.decidedAt,
    outcome,
    ...(outcome === "APPROVE" ? { approved_limit_minor: parts.cart.total_minor } : {}),
    packet: parts.packet,
    rules: nonEmpty(parts.rules),
    judge: parts.judge,
    ...(explanation === undefined ? {} : { explanation }),
    ...(resolves === undefined ? {} : { resolves }),
    ...(parts.escalation === undefined ? {} : { escalation: parts.escalation }),
    engine: parts.engine,
  };
}
