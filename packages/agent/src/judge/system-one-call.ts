// One SystemOne request: POST the state and the planned rows, read the body, parse it strictly.
// Every outcome is a value; nothing here throws.
import { MAX_RESPONSE_BYTES, SYSTEM_ONE_PATH } from "./config";
import type { Deadline } from "./deadline";
import type { DiagnosticReason } from "./diagnostics";
import { sendRequest, type FetchLike } from "./http";
import { parseSystemOneResponse, type ParsedResponse } from "./parse";
import { toWireQuestions, type QuestionRow } from "./plan";
import type { JudgeQuestionDefs } from "./questions";
import type { JudgeState } from "./state";

export interface CallContext {
  readonly fetchImpl: FetchLike;
  readonly baseUrl: string;
  readonly model: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly rows: readonly QuestionRow[];
  /** Question wording; undefined sends the shipped default. */
  readonly questions?: JudgeQuestionDefs | undefined;
  readonly requireUsage: boolean;
  readonly deadline: Deadline;
}

export interface CallFailure {
  readonly ok: false;
  readonly status: "TIMEOUT" | "ERROR";
  readonly reason: DiagnosticReason;
  readonly detail: string;
  readonly httpStatus?: number;
  readonly inputTruncated: boolean;
}

export type CallOutcome = { readonly ok: true; readonly parsed: ParsedResponse } | CallFailure;

export function callFailure(
  status: "TIMEOUT" | "ERROR",
  reason: DiagnosticReason,
  detail: string,
  extra: { readonly httpStatus?: number; readonly inputTruncated?: boolean } = {},
): CallFailure {
  const base = { ok: false, status, reason, detail, inputTruncated: extra.inputTruncated === true } as const;
  return extra.httpStatus === undefined ? base : { ...base, httpStatus: extra.httpStatus };
}

const postUrl = (baseUrl: string): string => `${baseUrl.replace(/\/+$/, "")}${SYSTEM_ONE_PATH}`;

export async function callSystemOne(ctx: CallContext, state: JudgeState): Promise<CallOutcome> {
  const body = JSON.stringify({ model: ctx.model, state, questions: toWireQuestions(ctx.rows, ctx.questions) });
  const outcome = await sendRequest(ctx.fetchImpl, postUrl(ctx.baseUrl), { method: "POST", headers: ctx.headers, body }, ctx.deadline.signal, MAX_RESPONSE_BYTES);
  switch (outcome.kind) {
    case "aborted":
      return ctx.deadline.timedOut()
        ? callFailure("TIMEOUT", "timeout", "the judge timeout elapsed")
        : callFailure("TIMEOUT", "aborted", "the caller aborted the call");
    case "network":
      return callFailure("ERROR", "network", outcome.detail);
    case "too_large":
      return callFailure("ERROR", "too_large", "response body is larger than the cap");
    case "response":
      return interpret(ctx, outcome.status, outcome.text);
  }
}

function interpret(ctx: CallContext, status: number, text: string): CallOutcome {
  if (status < 200 || status >= 300) return callFailure("ERROR", "http_status", `HTTP ${status}`, { httpStatus: status });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return callFailure("ERROR", "invalid_json", "response is not valid JSON", { httpStatus: status });
  }
  const parsed = parseSystemOneResponse(json, ctx.rows, { requireUsage: ctx.requireUsage });
  return parsed.ok
    ? { ok: true, parsed: parsed.value }
    : callFailure("ERROR", parsed.reason, parsed.detail, { httpStatus: status, inputTruncated: parsed.inputTruncated });
}
