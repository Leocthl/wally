import { LogError } from "./errors";

/** Same patterns as mandate.schema.json $defs/LogId and $defs/MandateId (shared suffix alphabet). */
export const LOG_ID_RE = /^log_[A-Za-z0-9]{6,40}$/;
const MANDATE_ID_RE = /^mnd_([A-Za-z0-9]{6,40})$/;

/**
 * One log per packet, and one packet per mandate: mnd_X is logged in log_X. The verifier checks this
 * binding at seq 0, so a sealed credential cannot be replayed as the root of another log.
 */
export function logIdForMandate(mandateId: string): string {
  const match = MANDATE_ID_RE.exec(mandateId);
  if (!match) throw new LogError("LOG_ID", `not a mandate id: ${mandateId}`);
  return `log_${match[1] ?? ""}`;
}

export function assertLogId(logId: string): void {
  if (typeof logId !== "string" || !LOG_ID_RE.test(logId)) throw new LogError("LOG_ID", "log id must match log_[A-Za-z0-9]{6,40}");
}
