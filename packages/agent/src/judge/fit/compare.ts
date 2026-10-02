// Rotation-averaged answers against canonical-order answers on the same cases: how much option order moves
// the probabilities, and whether it flips any argmax. MEASURED(n) on the corpus.
import { JUDGE_QUESTIONS, QUESTION_OPTIONS, type JudgeQuestion } from "../questions";
import { mean } from "./stats";
import type { CaseResult } from "./types";

export interface QuestionComparison {
  readonly question: JudgeQuestion;
  readonly cells: number;
  /** Mean of the largest per-option change between the two runs. */
  readonly meanDelta: number;
  readonly maxDelta: number;
  /** Cases whose most likely label differs between the two runs. */
  readonly flips: number;
}

function argmax(dist: Readonly<Record<string, number>>): string {
  return Object.entries(dist).reduce((best, e) => (e[1] > best[1] ? e : best), ["", -1] as [string, number])[0];
}

export function compareRuns(rotated: readonly CaseResult[], canonical: readonly CaseResult[]): readonly QuestionComparison[] {
  const byId = new Map(canonical.map((r) => [r.id, r]));
  return JUDGE_QUESTIONS.map((question) => {
    const pairs = rotated.flatMap((r) => {
      const other = byId.get(r.id);
      return r.answers !== null && other?.answers != null ? [{ a: r.answers[question] as Record<string, number>, b: other.answers[question] as Record<string, number> }] : [];
    });
    const deltas = pairs.map(({ a, b }) => Math.max(...QUESTION_OPTIONS[question].map((l) => Math.abs((a[l] ?? 0) - (b[l] ?? 0)))));
    return {
      question,
      cells: pairs.length,
      meanDelta: mean(deltas),
      maxDelta: deltas.length === 0 ? 0 : Math.max(...deltas),
      flips: pairs.filter(({ a, b }) => argmax(a) !== argmax(b)).length,
    };
  });
}
