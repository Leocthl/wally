import type { JudgeProvider } from "@wally/core/generated";
import type { FailureReason } from "./parse";

export type DiagnosticReason =
  | "ok"
  | "timeout"
  | "aborted"
  | "invalid_timeout"
  | "network"
  | "http_status"
  | "invalid_json"
  | "too_large"
  | "input_too_large"
  | "internal"
  | "no_recording"
  | FailureReason;

/**
 * Why a call ended as it did. The JudgeRecord has no field for this, so callers that want logs hook in here.
 * Never carries the API key, request body or response body.
 */
export interface JudgeDiagnostic {
  readonly provider: JudgeProvider;
  readonly status: "OK" | "TIMEOUT" | "ERROR";
  readonly reason: DiagnosticReason;
  readonly detail: string;
  readonly httpStatus?: number;
  readonly latencyMs: number;
}

export type DiagnosticSink = (diagnostic: JudgeDiagnostic) => void;

/** A sink must never break a judgement: errors from the callback are swallowed. */
export function emitDiagnostic(sink: DiagnosticSink | undefined, diagnostic: JudgeDiagnostic): void {
  if (sink === undefined) return;
  try {
    sink(diagnostic);
  } catch {
    // diagnostics are best effort; the record already carries the outcome
  }
}
