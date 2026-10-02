// JSONL form of the log: one JCS (RFC 8785) line per entry, each ending in '\n'. The verifier accepts
// only this exact spelling, so any changed byte in an exported log fails (T-V1).
import { jcs } from "../crypto/jcs";
import type { LogEntry } from "../generated";

export function toJsonlLine(entry: LogEntry): string {
  return jcs(entry);
}

export function toJsonl(entries: readonly LogEntry[]): string {
  return entries.map((e) => `${toJsonlLine(e)}\n`).join("");
}
