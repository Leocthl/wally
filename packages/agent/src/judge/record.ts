// JudgeRecord construction. Every record that leaves an adapter passes the schema validator; a record that
// would not validate is replaced by a plain ERROR record (fail closed, I5).
import type { JudgeAnswers, JudgeProvider } from "@laisee/core/generated";
import type { JudgeRecord } from "@laisee/core/ports";
import { validateJudgeRecord } from "@laisee/core/schema";
import { UNKNOWN_VERSION } from "./config";

export interface RecordBase {
  readonly provider: JudgeProvider;
  readonly model: string;
  readonly version: string;
  /** Wall time of the judge step, MEASURED by the caller of this function. */
  readonly latencyMs: number;
  readonly shadow: boolean;
}

const toRecordBase = (base: RecordBase) => ({
  provider: base.provider,
  model: base.model.length > 0 ? base.model : UNKNOWN_VERSION,
  version: base.version.length > 0 ? base.version : UNKNOWN_VERSION,
  latency_ms: Math.max(0, Math.round(base.latencyMs)),
  shadow: base.shadow,
});

/** TIMEOUT or ERROR record. input_truncated is only ever set together with ERROR (schema rule). */
export function failureRecord(base: RecordBase, status: "TIMEOUT" | "ERROR", inputTruncated = false): JudgeRecord {
  const common = { ...toRecordBase(base), status };
  return status === "ERROR" && inputTruncated ? { ...common, input_truncated: true } : common;
}

export function okRecord(base: RecordBase, answers: JudgeAnswers): JudgeRecord {
  const record: JudgeRecord = { ...toRecordBase(base), status: "OK", answers };
  return validateJudgeRecord(record).ok ? record : failureRecord(base, "ERROR");
}
