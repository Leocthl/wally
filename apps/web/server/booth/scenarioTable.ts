// Node loader for data/scenarios/booth.json. The table itself (parsing, validation, beats) is portable and lives in
// src/booth/backend/scenarioTable.ts, shared with the on-device client.
import { readFileSync } from "node:fs";
import { parseScenarioTable, ScenarioTableError, type ScenarioTable } from "../../src/booth/backend/scenarioTable";

export {
  BEAT_MODES,
  cardBeatOf,
  parseScenarioTable,
  ScenarioTableError,
  type CustomEntry,
  type DerivedListing,
  type ScenarioBeat,
  type ScenarioEntry,
  type ScenarioExpect,
  type ScenarioTable,
} from "../../src/booth/backend/scenarioTable";

export function loadScenarioTable(path: string): ScenarioTable {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new ScenarioTableError(`cannot read ${path}: ${err instanceof Error ? err.message : "unknown error"}`);
  }
  return parseScenarioTable(raw);
}
