// Log-entry schema check for the verify path, over the precompiled validator (ajv standalone, src/schema/compiled):
// nothing is compiled with new Function at run time, so the verifier page runs under a CSP without 'unsafe-eval'.
// Only the first issue is kept, so one hostile line cannot make the verifier print thousands of errors; the line limit
// (log/limits.ts) bounds the work it takes to find them. Browser-safe.
import { clipMessage } from "../crypto/errors";
import type { LogEntry } from "../generated";
import { validateLogEntry, type ValidationIssue, type ValidationResult } from "../schema";

/** Issues and characters shown in one failure detail (display limits, not log rules). */
const MAX_ISSUES = 3;
const MAX_DETAIL_CHARS = 400;
const MAX_PATH_CHARS = 80;

/** validateLogEntry that reports the first error only. Never throws on bad input. */
export function validateLogEntryFast(data: unknown): ValidationResult<LogEntry> {
  const checked = validateLogEntry(data);
  return checked.ok ? checked : { ok: false, errors: checked.errors.slice(0, 1) };
}

/** At most a few issues, each path and the whole text clipped: a failure detail stays readable and small. */
export function briefIssues(errors: readonly ValidationIssue[]): string {
  const shown = errors.slice(0, MAX_ISSUES).map((e) => `${clipMessage(e.path, MAX_PATH_CHARS)} ${e.message} (${e.keyword})`);
  const more = errors.length > MAX_ISSUES ? `; ${errors.length - MAX_ISSUES} more` : "";
  return clipMessage(`${shown.join("; ")}${more}`, MAX_DETAIL_CHARS);
}
