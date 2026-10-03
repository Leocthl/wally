// Compact per-entry timeline: a tick for each entry before the first failure, a cross on it, "not checked" after.
// Labels (seq, kind, time) are read from the unverified lines and shown as text; status comes from the report. The plain
// view's label ("Approved") is chosen here too, from the same line (plain/events.ts), so the renderers never see a line.
import type { Checkpoint, ParsedLog, VerifyReport } from "@wally/core/verify";
import { ownInteger, ownString } from "./entry-fields";
import { LIMITS } from "./limits";
import { eventKeyOf, type EventKey } from "./plain/events";

export type RowStatus = "ok" | "broken" | "unchecked";
export type CheckpointStatus = "none" | "ok" | "broken" | "unchecked";

export interface TimelineRow {
  readonly index: number;
  readonly seq: string;
  readonly kind: string;
  readonly ts: string;
  readonly status: RowStatus;
  /** Which plain label the row gets ("Approved"); a row built without one reads as "A receipt". */
  readonly event?: EventKey;
}

export interface Timeline {
  readonly rows: readonly TimelineRow[];
  readonly checkpoint: CheckpointStatus;
}

function cell(value: string | undefined, fallback: string): string {
  if (value === undefined || value === "") return fallback;
  return value.length > LIMITS.cellChars ? `${value.slice(0, LIMITS.cellChars - 1)}…` : value;
}

function label(parsed: ParsedLog, index: number): Omit<TimelineRow, "status"> {
  if (parsed.badLines.has(index)) return { index, seq: "?", kind: "unreadable line", ts: "", event: "other" };
  const entry = parsed.entries[index];
  const seq = ownInteger(entry, "seq");
  return {
    index,
    seq: seq === undefined ? "?" : String(seq),
    kind: cell(ownString(entry, "kind"), "?"),
    ts: cell(ownString(entry, "ts"), ""),
    event: eventKeyOf(entry),
  };
}

/** TRUNCATED at a seq inside the log: the checkpoint names that entry and its hash differs (rewritten). */
function rewrittenAt(parsed: ParsedLog, failedSeq: number, checkpoint?: Checkpoint): boolean {
  if (checkpoint === undefined || failedSeq >= parsed.entries.length || checkpoint.seq !== failedSeq) return false;
  return ownString(parsed.entries[0], "log_id") === checkpoint.log_id;
}

function breakIndex(parsed: ParsedLog, report: VerifyReport, checkpoint?: Checkpoint): number | null {
  if (report.ok) return null;
  if (report.reason !== "TRUNCATED") return report.failedSeq;
  return rewrittenAt(parsed, report.failedSeq, checkpoint) ? report.failedSeq : null;
}

/** TRUNCATED is the checkpoint comparison failing; any other failure stops the walk before the checkpoint. */
function checkpointStatus(report: VerifyReport, checkpoint?: Checkpoint): CheckpointStatus {
  if (checkpoint === undefined) return "none";
  if (report.ok) return "ok";
  return report.reason === "TRUNCATED" ? "broken" : "unchecked";
}

export function buildTimeline(parsed: ParsedLog, report: VerifyReport, checkpoint?: Checkpoint): Timeline {
  const broken = breakIndex(parsed, report, checkpoint);
  const status = (i: number): RowStatus => (broken === null || i < broken ? "ok" : i === broken ? "broken" : "unchecked");
  const rows = parsed.entries.map((_, i) => ({ ...label(parsed, i), status: status(i) }));
  return { rows, checkpoint: checkpointStatus(report, checkpoint) };
}
