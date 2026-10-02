// Row plan: which wire questions one request carries. Default is k option-order rotations per question
// (the Laya README recipe): each rotation is sent as an extra question and the answers are averaged back.
import { JUDGE_QUESTION_DEFS, JUDGE_QUESTIONS, QUESTION_OPTIONS, type ChoiceQuestionDef, type JudgeQuestion, type JudgeQuestionDefs } from "./questions";

export interface QuestionRow {
  /** Question id on the wire, e.g. `injection_risk__r2`. */
  readonly requestId: string;
  readonly question: JudgeQuestion;
  /** null when the question is sent once in the default option order. */
  readonly rotation: number | null;
  readonly optionOrder: readonly number[] | null;
}

export interface WireQuestion extends ChoiceQuestionDef {
  readonly option_order?: readonly number[];
}

/** Option indices for rotation r of k options: [r, r+1, ...] modulo k. Slot s shows option (s + r) mod k. */
export function rotationOrder(k: number, r: number): readonly number[] {
  return Array.from({ length: k }, (_, slot) => (slot + r) % k);
}

function rowsFor(question: JudgeQuestion, rotations: boolean): readonly QuestionRow[] {
  if (!rotations) return [{ requestId: question, question, rotation: null, optionOrder: null }];
  const k = QUESTION_OPTIONS[question].length;
  return Array.from({ length: k }, (_, r) => ({
    requestId: `${question}__r${r}`,
    question,
    rotation: r,
    optionOrder: rotationOrder(k, r),
  }));
}

/** rotations=true: 2 + 3 + 2 + 2 = 9 rows in one request. rotations=false: the 4 questions once. */
export function planRows(rotations: boolean): readonly QuestionRow[] {
  return JUDGE_QUESTIONS.flatMap((q) => rowsFor(q, rotations));
}

/** `defs` defaults to the shipped wording; the B-19 experiment passes a variant. Labels never change. */
export function toWireQuestions(rows: readonly QuestionRow[], defs: JudgeQuestionDefs = JUDGE_QUESTION_DEFS): Readonly<Record<string, WireQuestion>> {
  return Object.fromEntries(
    rows.map((row) => {
      const def = defs[row.question];
      const wire: WireQuestion = row.optionOrder === null ? { ...def } : { ...def, option_order: [...row.optionOrder] };
      return [row.requestId, wire];
    }),
  );
}
