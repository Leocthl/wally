// PLANNER_PROVIDER=replay for the booth: recorded planner outputs chosen by the listing set of each submit, mapped
// through data/scenarios/booth.json (each listing set names one record). The host loads the records (Node: files via
// loadReplayRecords; browser: the bundled JSON via parseReplayFile); a table that names an unknown record is a
// start-up error. The replay planner itself is @wally/agent's, unchanged.
import { createReplayPlanner } from "@wally/agent/planner";
import type { ListingRecord, PlannerReplayRecord } from "@wally/core/generated";
import type { PlannerFactory } from "@wally/core/orchestrator";
import type { PlannerPort, ProposeCartInput } from "@wally/core/ports";
import type { ScenarioTable } from "./scenarioTable";
import type { Shop } from "./shop";

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

/**
 * A live planner (Qwen, or the Laya decision loop) that falls back to the scenario's recorded planner output when it makes
 * no proposal. Only for the fixed booth buttons, whose listing sets are named in the table: they are fixtures, so a button
 * must show the same stop every time. A free-text ask lists the whole shelf, which is not in the table, so it never falls
 * back and "Wally could not tell which item you meant" stays true.
 */
export function withRecordedFallback(live: PlannerFactory, records: readonly PlannerReplayRecord[], table: ScenarioTable): PlannerFactory {
  const byListings = recordByListings(table);
  const replay = replayPlannerFactory(records, table);
  return (listings) => {
    const planner = live(listings);
    if (!byListings.has(keyOf(listings.map((l) => l.id)))) return planner;
    const recorded = replay(listings);
    const alternatives = planner.alternatives?.bind(planner);
    return {
      propose: async (ctx, opts) => (await planner.propose(ctx, opts)) ?? recorded.propose(ctx, opts),
      ...(alternatives === undefined ? {} : { alternatives }),
    };
  };
}

/**
 * Show Wally a photo: the shopper picked one item of the photo shelf (shop.ts) from the matches, so for a listing set of
 * exactly that one item the proposal is fixed by code. A photo item is never on the Ask shelf or in a scenario, so this
 * never replaces a planner anywhere else. The cart builder, the judge, rules R1 to R12 and the one-off card run as for any cart.
 */
export function withPhotoPicks(inner: PlannerFactory, shop: Shop): PlannerFactory {
  return (listings) => {
    const only = listings.length === 1 ? listings[0] : undefined;
    const entry = only === undefined ? undefined : shop.get(only.id);
    return entry === undefined ? inner(listings) : pickedPlanner(entry.listing);
  };
}

/** The proposal for the one item the shopper picked: that listing, that item, one of them. No model, no key, no card (I4). */
function pickedPlanner(listing: ListingRecord): PlannerPort {
  const title = listing.items[0]?.title;
  const proposal: ProposeCartInput | null = title === undefined ? null : { listing_url: listing.url, items: [{ title, qty: 1 }], note: "You picked this item." };
  return {
    propose: async () => proposal,
    alternatives: async () => null,
  };
}
