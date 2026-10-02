// The R10 gates as the fit sees them, with the engine's own comparisons (docs/02 section 9, [F36, F50]).
// Thresholds are in the engine's units: scope_fit stops when P(in_scope) < T, the others when value >= T.
import type { JudgeAnswers } from "@laisee/core/generated";
import type { JudgeQuestion } from "../questions";
import type { CorpusLabels } from "./corpus";
import type { GateThresholds } from "./thresholds";

export type GateId = "scope_fit" | "injection_risk" | "seller_escalate" | "seller_deny" | "escalate_or_proceed";

export interface GateSpec {
  readonly id: GateId;
  readonly question: JudgeQuestion;
  readonly thresholdName: keyof GateThresholds;
  /** The R10 rule in words, for the report. */
  readonly rule: string;
  /** The probability the engine compares against the threshold. */
  readonly engineValue: (a: JudgeAnswers) => number;
  /** true: stop when value < T (scope_fit). false: stop when value >= T. */
  readonly stopsBelow: boolean;
  /** Higher is always more dangerous; used for distributions and calibration. */
  readonly risk: (a: JudgeAnswers) => number;
  /** true = the label says stop, false = the label says pass, null = ambiguous, left out of the statistics. */
  readonly positive: (labels: CorpusLabels) => boolean | null;
  /** The corpus label of this gate's question. */
  readonly labelOf: (labels: CorpusLabels) => string;
}

const injectionValue = (a: JudgeAnswers): number => a.injection_risk.suspicious + a.injection_risk.injection;

export const GATES: readonly GateSpec[] = [
  {
    id: "scope_fit",
    question: "scope_fit",
    thresholdName: "T_scope",
    rule: "P(in_scope) < T_scope => ESCALATE (R10.scope)",
    engineValue: (a) => a.scope_fit.in_scope,
    stopsBelow: true,
    risk: (a) => 1 - a.scope_fit.in_scope,
    positive: (l) => l.scope_fit === "out_of_scope",
    labelOf: (l) => l.scope_fit,
  },
  {
    id: "injection_risk",
    question: "injection_risk",
    thresholdName: "T_inj",
    rule: "P(suspicious) + P(injection) >= T_inj => DENY (R10.injection)",
    engineValue: injectionValue,
    stopsBelow: false,
    risk: injectionValue,
    positive: (l) => (l.injection_risk === "suspicious" ? null : l.injection_risk === "injection"),
    labelOf: (l) => l.injection_risk,
  },
  {
    id: "seller_escalate",
    question: "seller_risk",
    thresholdName: "T_sell_esc",
    rule: "P(high_risk) >= T_sell_esc => ESCALATE (R10.seller_risk)",
    engineValue: (a) => a.seller_risk.high_risk,
    stopsBelow: false,
    risk: (a) => a.seller_risk.high_risk,
    positive: (l) => l.seller_risk === "high_risk",
    labelOf: (l) => l.seller_risk,
  },
  {
    id: "seller_deny",
    question: "seller_risk",
    thresholdName: "T_sell_deny",
    rule: "P(high_risk) >= T_sell_deny => DENY (R10.seller_risk)",
    engineValue: (a) => a.seller_risk.high_risk,
    stopsBelow: false,
    risk: (a) => a.seller_risk.high_risk,
    positive: (l) => l.seller_risk === "high_risk",
    labelOf: (l) => l.seller_risk,
  },
  {
    id: "escalate_or_proceed",
    question: "escalate_or_proceed",
    thresholdName: "T_esc",
    rule: "P(escalate) >= T_esc => ESCALATE (R10.escalate)",
    engineValue: (a) => a.escalate_or_proceed.escalate,
    stopsBelow: false,
    risk: (a) => a.escalate_or_proceed.escalate,
    positive: (l) => l.escalate_or_proceed === "escalate",
    labelOf: (l) => l.escalate_or_proceed,
  },
];

export function gateById(id: GateId): GateSpec {
  const gate = GATES.find((g) => g.id === id);
  if (gate === undefined) throw new Error(`unknown gate ${id}`);
  return gate;
}

/** The engine's comparison for a value already read from the answers. */
export function stopsValue(gate: GateSpec, value: number, t: number): boolean {
  return gate.stopsBelow ? value < t : value >= t;
}

/** The engine's comparison at threshold t (in the engine's units). */
export function stops(gate: GateSpec, answers: JudgeAnswers, t: number): boolean {
  return stopsValue(gate, gate.engineValue(answers), t);
}
