// Strict parser for a SystemOne (Laya or Jev) response. Anything unexpected is a failure, never a guess:
// the adapter turns every failure into status ERROR, which R10 escalates (I5).
import type { JudgeAnswers } from "@wally/core/generated";
import { MAX_NAME_CHARS, PROBABILITY_SUM_TOLERANCE } from "./config";
import { averageDistributions, type Distribution } from "./average";
import { isRecord } from "./guards";
import type { QuestionRow } from "./plan";
import { JUDGE_QUESTIONS, QUESTION_OPTIONS, type JudgeQuestion } from "./questions";

export type FailureReason =
  | "invalid_shape"
  | "unknown_label"
  | "missing_probability"
  | "bad_probabilities"
  | "truncated"
  | "missing_usage";

export interface ParseFailure {
  readonly ok: false;
  readonly reason: FailureReason;
  /** Short, safe description (no response body is echoed). */
  readonly detail: string;
  /** true when Laya reported that part of the state was cut off: the judge did not see the whole listing. */
  readonly inputTruncated: boolean;
}

export interface ParsedResponse {
  readonly answers: JudgeAnswers;
  readonly model: string | null;
  readonly routingModel: string | null;
}

export type ParseResult = { readonly ok: true; readonly value: ParsedResponse } | ParseFailure;

export interface ParseOptions {
  /** Laya always reports usage. A response without it cannot prove the input was not truncated. */
  readonly requireUsage: boolean;
}

const clip = (text: string, max = 40): string => (text.length > max ? `${text.slice(0, max)}...` : text);

const fail = (reason: FailureReason, detail: string, inputTruncated = false): ParseFailure => ({
  ok: false,
  reason,
  detail,
  inputTruncated,
});

function checkUsage(raw: unknown, requireUsage: boolean): ParseFailure | null {
  if (raw === undefined || raw === null) return requireUsage ? fail("missing_usage", "response has no usage block") : null;
  if (!isRecord(raw)) return fail("invalid_shape", "usage is not an object");
  const { truncated, state_tokens_dropped: dropped, truncated_questions: questions } = raw;
  if (truncated === undefined && requireUsage) return fail("missing_usage", "usage.truncated is missing");
  if (truncated !== undefined && typeof truncated !== "boolean") return fail("invalid_shape", "usage.truncated is not a boolean");
  if (dropped !== undefined && (typeof dropped !== "number" || !Number.isFinite(dropped))) {
    return fail("invalid_shape", "usage.state_tokens_dropped is not a number");
  }
  if (questions !== undefined && !(Array.isArray(questions) && questions.every((q) => typeof q === "string"))) {
    return fail("invalid_shape", "usage.truncated_questions is not a list of strings");
  }
  const cutOff = truncated === true || (typeof dropped === "number" && dropped > 0) || (Array.isArray(questions) && questions.length > 0);
  return cutOff ? fail("truncated", "the judge server cut off part of the state", true) : null;
}

type DistributionResult = { readonly ok: true; readonly value: Distribution } | ParseFailure;

function checkLabels(probs: Readonly<Record<string, unknown>>, labels: readonly string[], id: string): ParseFailure | null {
  const unknown = Object.keys(probs).find((k) => !labels.includes(k));
  if (unknown !== undefined) return fail("unknown_label", `${id}: unknown label ${clip(unknown)}`);
  const missing = labels.find((l) => !Object.hasOwn(probs, l));
  return missing === undefined ? null : fail("missing_probability", `${id}: no probability for ${missing}`);
}

function checkValues(probs: Readonly<Record<string, unknown>>, labels: readonly string[], id: string): DistributionResult {
  const values: number[] = [];
  for (const label of labels) {
    const v = probs[label];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
      return fail("bad_probabilities", `${id}: probability for ${label} is not a number in [0, 1]`);
    }
    values.push(v);
  }
  const sum = values.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE) return fail("bad_probabilities", `${id}: probabilities sum to ${sum.toFixed(4)}`);
  return { ok: true, value: Object.fromEntries(labels.map((l, i) => [l, values[i] ?? 0])) };
}

function readDistribution(raw: unknown, labels: readonly string[], id: string): DistributionResult {
  if (!isRecord(raw)) return fail("invalid_shape", `${id}: answer is not an object`);
  if (raw["type"] !== undefined && raw["type"] !== "choice") return fail("invalid_shape", `${id}: answer type is not choice`);
  const probs = raw["probabilities"];
  if (!isRecord(probs)) return fail("invalid_shape", `${id}: probabilities is not an object`);
  const choice = raw["choice"];
  if (choice !== undefined && typeof choice !== "string") return fail("invalid_shape", `${id}: choice is not a string`);
  const labelProblem = checkLabels(probs, labels, id);
  if (labelProblem !== null) return labelProblem;
  if (typeof choice === "string" && !labels.includes(choice)) return fail("unknown_label", `${id}: unknown choice ${clip(choice)}`);
  return checkValues(probs, labels, id);
}

function collectQuestion(answers: Readonly<Record<string, unknown>>, rows: readonly QuestionRow[], q: JudgeQuestion): DistributionResult {
  const labels: readonly string[] = QUESTION_OPTIONS[q];
  const perRow: Distribution[] = [];
  for (const row of rows.filter((r) => r.question === q)) {
    if (!Object.hasOwn(answers, row.requestId)) return fail("invalid_shape", `no answer for ${row.requestId}`);
    const one = readDistribution(answers[row.requestId], labels, row.requestId);
    if (!one.ok) return one;
    perRow.push(one.value);
  }
  return perRow.length === 0 ? fail("invalid_shape", `no rows planned for ${q}`) : { ok: true, value: averageDistributions(perRow, labels) };
}

function pick<L extends string>(dist: Distribution, labels: readonly L[]): { readonly [K in L]: number } {
  // Every label was validated present in readDistribution, so the lookup never falls back.
  return Object.fromEntries(labels.map((l) => [l, dist[l] ?? 0])) as { readonly [K in L]: number };
}

function toAnswers(d: Readonly<Record<JudgeQuestion, Distribution>>): JudgeAnswers {
  return {
    scope_fit: pick(d.scope_fit, QUESTION_OPTIONS.scope_fit),
    injection_risk: pick(d.injection_risk, QUESTION_OPTIONS.injection_risk),
    seller_risk: pick(d.seller_risk, QUESTION_OPTIONS.seller_risk),
    escalate_or_proceed: pick(d.escalate_or_proceed, QUESTION_OPTIONS.escalate_or_proceed),
  };
}

const stringOrNull = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v.slice(0, MAX_NAME_CHARS) : null);

/** Validates the whole response against the row plan and returns rotation-averaged answers in canonical order. */
export function parseSystemOneResponse(body: unknown, rows: readonly QuestionRow[], opts: ParseOptions): ParseResult {
  if (!isRecord(body)) return fail("invalid_shape", "response is not a JSON object");
  const usageProblem = checkUsage(body["usage"], opts.requireUsage);
  if (usageProblem !== null) return usageProblem;
  const answers = body["answers"];
  if (!isRecord(answers)) return fail("invalid_shape", "response has no answers object");
  const collected: Partial<Record<JudgeQuestion, Distribution>> = {};
  for (const q of JUDGE_QUESTIONS) {
    const one = collectQuestion(answers, rows, q);
    if (!one.ok) return one;
    collected[q] = one.value;
  }
  const routing = body["routing"];
  return {
    ok: true,
    value: {
      answers: toAnswers(collected as Readonly<Record<JudgeQuestion, Distribution>>),
      model: stringOrNull(body["model"]),
      routingModel: isRecord(routing) ? stringOrNull(routing["model"]) : null,
    },
  };
}
