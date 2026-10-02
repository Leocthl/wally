// Fail-fast log-entry schema check for the verify path. Ajv with allErrors: false stops at the first error,
// so one hostile line cannot make the verifier collect and print thousands of errors (the audit stalled it
// 13.6 s and built a 17 MB message on one 1 MB line). Same schema files as src/schema, which reports every
// error for authoring; this second instance is only for untrusted logs. Browser-safe.
import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import cardRecordSchema from "../../../../schemas/card-record.schema.json" with { type: "json" };
import cartSchema from "../../../../schemas/cart.schema.json" with { type: "json" };
import decisionSchema from "../../../../schemas/decision.schema.json" with { type: "json" };
import logEntrySchema from "../../../../schemas/log-entry.schema.json" with { type: "json" };
import mandateCredentialSchema from "../../../../schemas/mandate-credential.schema.json" with { type: "json" };
import mandateSchema from "../../../../schemas/mandate.schema.json" with { type: "json" };
import packetStateSchema from "../../../../schemas/packet-state.schema.json" with { type: "json" };
import { clipMessage } from "../crypto/errors";
import type { LogEntry } from "../generated";
import type { ValidationIssue, ValidationResult } from "../schema";

/** Issues and characters shown in one failure detail (display limits, not log rules). */
const MAX_ISSUES = 3;
const MAX_DETAIL_CHARS = 400;
const MAX_PATH_CHARS = 80;

const LOG_ENTRY_ID = "https://laisee.local/schemas/log-entry.schema.json";

function compileLogEntry() {
  const ajv = new Ajv2020({ strict: true, strictRequired: true, allowUnionTypes: true, allErrors: false });
  addFormats(ajv);
  for (const schema of [mandateSchema, mandateCredentialSchema, cartSchema, packetStateSchema, decisionSchema, cardRecordSchema, logEntrySchema]) {
    ajv.addSchema(schema);
  }
  const fn = ajv.getSchema(LOG_ENTRY_ID);
  if (!fn) throw new Error(`schema not registered: ${LOG_ENTRY_ID}`);
  return fn;
}

const logEntry = compileLogEntry();

const toIssue = (e: ErrorObject): ValidationIssue => ({ path: e.instancePath || "/", keyword: e.keyword, message: e.message ?? "invalid" });

/** validateLogEntry that stops at the first error. Never throws on bad input. */
export function validateLogEntryFast(data: unknown): ValidationResult<LogEntry> {
  return logEntry(data) ? { ok: true, value: data as LogEntry } : { ok: false, errors: (logEntry.errors ?? []).slice(0, MAX_ISSUES).map(toIssue) };
}

/** At most a few issues, each path and the whole text clipped: a failure detail stays readable and small. */
export function briefIssues(errors: readonly ValidationIssue[]): string {
  const shown = errors.slice(0, MAX_ISSUES).map((e) => `${clipMessage(e.path, MAX_PATH_CHARS)} ${e.message} (${e.keyword})`);
  const more = errors.length > MAX_ISSUES ? `; ${errors.length - MAX_ISSUES} more` : "";
  return clipMessage(`${shown.join("; ")}${more}`, MAX_DETAIL_CHARS);
}
