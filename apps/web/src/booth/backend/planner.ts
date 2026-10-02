// PLANNER_PROVIDER=replay for the booth: recorded planner outputs chosen by the listing set of each submit, mapped
// through data/scenarios/booth.json (each listing set names one record). The host loads the records (Node: files via
// loadReplayRecords; browser: the bundled JSON via parseReplayFile); a table that names an unknown record is a
// start-up error. The replay planner itself is @laisee/agent's, unchanged.
import { createReplayPlanner } from "@laisee/agent/planner";
import type { PlannerReplayRecord } from "@laisee/core/generated";
import type { PlannerFactory } from "@laisee/core/orchestrator";
import type { ScenarioTable } from "./scenarioTable";

const keyOf = (ids: readonly string[]): string => [...ids].sort().join("|");

/** Listing-set key to replay record id; throws when two entries with the same listings name different records. */
function recordByListings(table: ScenarioTable): ReadonlyMap<string, string> {
  const byListings = new Map<string, string>();
  for (const entry of [...Object.values(table.scenarios), table.custom]) {
    const key = keyOf(entry.listings);
    const known = byListings.get(key);
    if (known !== undefined && known !== entry.plannerReplay) throw new Error(`booth.json: listings ${key} name two replay records (${known}, ${entry.plannerReplay})`);
    byListings.set(key, entry.plannerReplay);
  }
  return byListings;
}

export function replayPlannerFactory(records: readonly PlannerReplayRecord[], table: ScenarioTable): PlannerFactory {
  const byListings = recordByListings(table);
  const missing = [...byListings.values()].filter((id) => !records.some((r) => r.scenario === id));
  if (missing.length > 0) throw new Error(`booth.json names unknown planner replay record(s): ${missing.join(", ")}`);
  return (listings) => {
    const scenario = byListings.get(keyOf(listings.map((l) => l.id)));
    return createReplayPlanner({ records, catalogue: listings, ...(scenario === undefined ? {} : { scenario }) });
  };
}
