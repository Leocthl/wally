// Test helpers that build Laya/Jev-shaped wire responses for a row plan.
import type { QuestionRow } from "../../src/judge/plan";
import { QUESTION_OPTIONS, type JudgeQuestion } from "../../src/judge/questions";

export type Dist = Readonly<Record<string, number>>;
export type Distributions = Readonly<Record<JudgeQuestion, Dist>>;

/** A calm, clearly in-scope, clean, low-risk judgement. Each question sums to 1. */
export const BASE_DISTRIBUTIONS: Distributions = {
  scope_fit: { in_scope: 0.8, out_of_scope: 0.2 },
  injection_risk: { clean: 0.7, suspicious: 0.2, injection: 0.1 },
  seller_risk: { low_risk: 0.75, high_risk: 0.25 },
  escalate_or_proceed: { proceed: 0.7, escalate: 0.3 },
};

export const CLEAN_USAGE = {
  input_tokens: 800,
  output_tokens: 0,
  state_tokens: 140,
  state_tokens_dropped: 0,
  truncated: false,
  truncated_questions: [] as string[],
};

export function answerFor(dist: Dist, choice?: string) {
  const labels = Object.keys(dist);
  const top = labels.reduce((best, l) => ((dist[l] ?? 0) > (dist[best] ?? 0) ? l : best), labels[0] ?? "");
  return {
    type: "choice",
    choice: choice ?? top,
    probabilities: { ...dist },
    confidence: 0.1,
    answer_confidence: dist[top] ?? 0,
    action: { act_probability: 1.0 },
  };
}

/** A well-formed response for the given rows; every rotation of a question carries the same distribution. */
export function wireResponse(
  rows: readonly QuestionRow[],
  dists: Distributions = BASE_DISTRIBUTIONS,
  overrides: { usage?: unknown; model?: string; routingModel?: string } = {},
) {
  const answers = Object.fromEntries(rows.map((r) => [r.requestId, answerFor(dists[r.question])]));
  return {
    model: overrides.model ?? "laya-rl-agent",
    answers,
    usage: "usage" in overrides ? overrides.usage : CLEAN_USAGE,
    routing: { model: overrides.routingModel ?? "typed-decisions", repo: "convaiinnovations/laya/typed-decisions" },
  };
}

export function labelsOf(q: JudgeQuestion): readonly string[] {
  return QUESTION_OPTIONS[q];
}
