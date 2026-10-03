// Ask Wally on the portable booth backend: which listing records a typed request is planned over.
//   live      the planner is a model (Laya rule planner, local Qwen): it chooses among the whole shelf.
//   recorded  the planner replays recordings (PLANNER_PROVIDER=replay, on-device mode): only the sample requests that
//             have a recording can be run, and anything else is an INFO run saying so. No verdict is made up.
// The shelf is the SIMULATED demo shops. Pure functions; the host reads the fixture files (Node: fs, browser: bundle).
import type { ListingRecord } from "@wally/core/generated";
import type { Catalogue } from "./catalogue";
import type { ScenarioTable } from "./scenarioTable";
import { normaliseText } from "./validate";

export type AskSource =
  | { readonly kind: "live"; readonly shelf: readonly ListingRecord[] }
  | {
      readonly kind: "recorded";
      /** Normalised request to the ids of the listings it was recorded over. */
      readonly requests: ReadonlyMap<string, readonly string[]>;
      /** Said when the request has no recording. */
      readonly unknownNote: string;
    };

/**
 * Every fixture shop, then derived listings that do not repeat an item already on the shelf. A derived listing is a
 * scenario variant of a fixture (same item from a seller with an old Scameter capture, the Product specifications template):
 * on the shelf it would make every "a cotton tee" a tie between two sellers, and the planner then asks instead of choosing.
 */
export function askShelf(catalogue: Catalogue, table: ScenarioTable): readonly ListingRecord[] {
  const derived = new Set(table.derivedListings.map((d) => d.id));
  const templates = new Set(table.custom.listings);
  const all = [...catalogue.listings.values()].filter((l) => !templates.has(l.id));
  const fixtures = all.filter((l) => !derived.has(l.id));
  const extra = all
    .filter((l) => derived.has(l.id))
    .reduce<readonly ListingRecord[]>((kept, l) => {
      const taken = new Set([...fixtures, ...kept].flatMap((k) => k.items.map((i) => i.title)));
      return l.items.some((i) => taken.has(i.title)) ? kept : [...kept, l];
    }, []);
  return [...fixtures, ...extra];
}

/** Case, spacing and a closing full stop or question mark do not tell two requests apart. */
export const requestKey = (text: string): string => normaliseText(text).toLowerCase().replace(/[.!?。！？]+$/u, "").trim();

/** One planner fixture file as read by the host: its name (for messages) and its text. */
export interface FixtureText {
  readonly name: string;
  readonly text: string;
}

const REQUEST_IN_NOTE = /Request: "([^"]+)"/;

function recordedRequest(file: FixtureText): { readonly request: string; readonly listingIds: readonly string[]; readonly scenario: string } | null {
  try {
    const envelope = JSON.parse(file.text) as { note?: unknown; data?: { scenario?: unknown; listing_ids?: unknown } };
    const request = typeof envelope.note === "string" ? REQUEST_IN_NOTE.exec(envelope.note)?.[1] : undefined;
    const { scenario, listing_ids: ids } = envelope.data ?? {};
    if (request === undefined || typeof scenario !== "string" || !Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return null;
    return { request, listingIds: ids as readonly string[], scenario };
  } catch {
    return null; // a file that does not parse is the host loader's error to report, not a request to offer
  }
}

/**
 * The requests that have a recording, from the planner fixture files (the request is written in each file's note as
 * Request: "...") and the booth table's buy buttons. A fixture wins over a button for the same words, because its
 * listing set is the one the recorded cheaper option (the `-alternative` record) was made over. A record over a listing
 * the catalogue does not have, and a record that answers a budget stop, are not requests.
 */
export function recordedRequests(files: readonly FixtureText[], catalogue: Catalogue, table: ScenarioTable): ReadonlyMap<string, readonly string[]> {
  const known = (ids: readonly string[]): boolean => ids.every((id) => catalogue.listings.has(id));
  const fromFiles = files.flatMap((f) => {
    const hit = recordedRequest(f);
    return hit === null || hit.scenario.endsWith("-alternative") || !known(hit.listingIds) ? [] : [[requestKey(hit.request), hit.listingIds] as const];
  });
  const fromButtons = Object.values(table.scenarios)
    .filter((entry) => entry.run === "buy")
    .map((entry) => [requestKey(entry.request), entry.listings] as const);
  return [...fromFiles, ...fromButtons].reduce<ReadonlyMap<string, readonly string[]>>(
    (index, [key, ids]) => (index.has(key) ? index : new Map([...index, [key, ids]])),
    new Map(),
  );
}
