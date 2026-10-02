// @laisee/rail-sim/node: Node-only helpers (file access). Kept apart so the main entry stays free of node: imports.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DeclineTableError, parseDeclineTable, type DeclineTable } from "./decline-table";

/** Path of the shipped SIMULATED default decline table. */
export const DEFAULT_DECLINE_TABLE_PATH = fileURLToPath(new URL("../data/decline-table.default.json", import.meta.url));

function reason(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error";
}

/**
 * Loads a decline table from a JSON file, e.g. one filled from data/real-card-test.md. Throws DeclineTableError
 * naming the file when it is missing, is not JSON, or does not validate.
 */
export function loadDeclineTableFile(path: string): DeclineTable {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new DeclineTableError(`${path}: cannot read the file (${reason(err)})`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new DeclineTableError(`${path}: not valid JSON (${reason(err)})`);
  }
  try {
    return parseDeclineTable(json);
  } catch (err) {
    throw new DeclineTableError(`${path}: ${reason(err).replace(/^decline table: /, "")}`);
  }
}
