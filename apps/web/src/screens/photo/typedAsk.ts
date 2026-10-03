// Typed Ask must never dead-end. Where a live planner runs (the booth with the local model or the rule planner) the words
// go to it first; when it cannot pick an item, or the host only knows its sample asks, the same words are read by the fixed
// keyword reader and shown as "Similar in the shop" instead of "couldn't pick a clear item". This is the one place that
// says which endings of a typed ask count as "could not pick".
import type { RunSummary } from "../../api/types";

/** The ends of a typed ask that decided nothing because no item was chosen (not a stop by the rules, not a failure). */
const COULD_NOT_PICK = /^(NO_PROPOSAL:(planner_null|planner_timeout|planner_error)|UNKNOWN_REQUEST|ON_DEVICE_UNKNOWN_REQUEST)$/;

export function couldNotPick(run: RunSummary | undefined): boolean {
  return run !== undefined && run.outcome === "INFO" && run.code !== undefined && COULD_NOT_PICK.test(run.code);
}
