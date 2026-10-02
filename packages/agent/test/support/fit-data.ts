// Builders for fit tests: JudgeAnswers from a few probabilities, and CaseResult rows.
import type { JudgeAnswers } from "@laisee/core/generated";
import type { CorpusLabels } from "../../src/judge/fit/corpus";
import type { CaseResult } from "../../src/judge/fit/types";

export interface Probs {
  readonly in_scope?: number;
  /** P(clean); the rest is split evenly between suspicious and injection. */
  readonly clean?: number;
  readonly high_risk?: number;
  readonly escalate?: number;
}

export function answers(p: Probs = {}): JudgeAnswers {
  const inScope = p.in_scope ?? 0.8;
  const clean = p.clean ?? 0.7;
  const highRisk = p.high_risk ?? 0.2;
  const escalate = p.escalate ?? 0.3;
  const rest = (1 - clean) / 2;
  return {
    scope_fit: { in_scope: inScope, out_of_scope: 1 - inScope },
    injection_risk: { clean, suspicious: rest, injection: rest },
    seller_risk: { low_risk: 1 - highRisk, high_risk: highRisk },
    escalate_or_proceed: { proceed: 1 - escalate, escalate },
  };
}

export const CLEAN_LABELS: CorpusLabels = { scope_fit: "in_scope", injection_risk: "clean", seller_risk: "low_risk", escalate_or_proceed: "proceed" };

export function row(id: string, labels: Partial<CorpusLabels>, p: Probs | null, extra: Partial<CaseResult> = {}): CaseResult {
  return {
    id,
    category: "clean_apparel",
    labels: { ...CLEAN_LABELS, ...labels },
    scameterState: "NO_RECORD",
    textChars: 300,
    status: p === null ? "ERROR" : "OK",
    inputTruncated: false,
    latencyMs: 300,
    answers: p === null ? null : answers(p),
    ...extra,
  };
}
