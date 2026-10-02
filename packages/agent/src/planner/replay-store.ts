// Loads recorded planner outputs (data/fixtures/planner/*.json) for the replay backend. Each file is the
// fixture envelope { fixture, provenance, schema, note, data }; data must match planner-replay.schema.json.
// Loading is a start-up step, so a bad file is a PlannerConfigError and not a silent skip.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PlannerReplayRecord } from "@laisee/core/generated";
import { formatIssues, validatePlannerReplayRecord } from "@laisee/core/schema";
import { PlannerConfigError } from "./config";

const ENVELOPE_KEYS = ["data", "fixture", "note", "provenance", "schema"];

export function parseReplayFile(file: string, text: string): PlannerReplayRecord {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new PlannerConfigError(`planner fixture ${file}: ${err instanceof Error ? err.message : "not valid JSON"}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new PlannerConfigError(`planner fixture ${file}: not an object`);
  const envelope = raw as Record<string, unknown>;
  if (Object.keys(envelope).sort().join() !== ENVELOPE_KEYS.join()) {
    throw new PlannerConfigError(`planner fixture ${file}: envelope keys must be fixture, provenance, schema, note, data`);
  }
  if (envelope["provenance"] !== "SIMULATED" || envelope["schema"] !== "planner-replay") {
    throw new PlannerConfigError(`planner fixture ${file}: provenance must be SIMULATED and schema planner-replay`);
  }
  const checked = validatePlannerReplayRecord(envelope["data"]);
  if (!checked.ok) throw new PlannerConfigError(`planner fixture ${file}: ${formatIssues(checked.errors)}`);
  return checked.value;
}

/** Every *.json file of `dir`, sorted by name. Throws PlannerConfigError on an unreadable dir, a bad file or a repeated scenario id. */
export function loadReplayRecords(dir: string): readonly PlannerReplayRecord[] {
  let names: readonly string[];
  try {
    names = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch (err) {
    throw new PlannerConfigError(`planner fixtures: cannot read ${dir}: ${err instanceof Error ? err.message : "unknown error"}`);
  }
  const records = names.map((name) => parseReplayFile(name, readFileSync(join(dir, name), "utf8")));
  const repeated = records.find((r, i) => records.findIndex((o) => o.scenario === r.scenario) !== i);
  if (repeated !== undefined) throw new PlannerConfigError(`planner fixtures: scenario ${repeated.scenario} appears twice`);
  return records;
}
