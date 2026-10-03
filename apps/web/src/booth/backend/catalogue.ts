// The SIMULATED catalogue the booth plans and prices from: listing records and Scameter captures from data/fixtures
// (validated, SIMULATED only), plus the derived listings of data/scenarios/booth.json. The planner and the cart builder
// get the same records (one list per submit). Fixture times are placeholders [F59], so a capture keeps its age relative
// to the reference cart and is restamped against the clock: the booth behaves the same on any day, and the stale
// capture stays older than the F52 limit. Portable: the host reads the fixture files (Node: server/booth/catalogue.ts;
// browser: the bundled JSON) and hands the parsed envelopes to buildCatalogue.
import type { ListingRecord, ScameterCapture } from "@wally/core/generated";
import type { ScameterLookup } from "@wally/core/cart";
import { ENGINE_CONFIG } from "@wally/core/config";
import type { Clock } from "@wally/core/ports";
import { formatIssues, validateCart, validateListingRecord, validateScameterCapture, type Validator } from "@wally/core/schema";
import type { DerivedListing, ScenarioTable } from "./scenarioTable";
import { buildShop, type Shop } from "./shop";

export class CatalogueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogueError";
  }
}

export interface Catalogue {
  /** Listing records by id: fixtures plus derived listings. */
  readonly listings: ReadonlyMap<string, ListingRecord>;
  /** Scameter captures by capture_ref, with their age in ms relative to the reference cart. */
  readonly captures: ReadonlyMap<string, { readonly capture: ScameterCapture; readonly ageMs: number }>;
  /**
   * The photo shelf (shop.ts): SIMULATED items found by showing Wally a picture. Never part of `listings`, so the Ask
   * shelf, the booth scenarios and the recorded planner sets cannot see them.
   */
  readonly shop: Shop;
}

/** F22 shape: subtotal HK$520 against HK$541 left is HK$21 under; shipping then tips it over. */
export const OVERFLOW_UNDER_MINOR = 2_100;

/** One parsed fixture file: `name` (its path or file name) is only used in messages. */
export interface FixtureFile {
  readonly name: string;
  readonly raw: unknown;
}

/** The fixture files a catalogue is built from, each list sorted by name by the host. */
export interface CatalogueSources {
  /** data/fixtures/listings/*.json */
  readonly listings: readonly FixtureFile[];
  /** data/fixtures/carts/attempt-1.json: its proposed_at is the reference time for capture ages. */
  readonly referenceCart: FixtureFile;
  /** data/fixtures/scameter/*.json */
  readonly captures: readonly FixtureFile[];
  /** data/photo-shelf: the photo shelf (items.json) and the captures only it uses (scameter/*.json). Optional. */
  readonly shop?: { readonly items: FixtureFile; readonly captures: readonly FixtureFile[] };
}

function readEnvelope<T>(file: FixtureFile, schema: string, validate: Validator<T>): T {
  const env = (file.raw ?? {}) as { provenance?: unknown; schema?: unknown; data?: unknown };
  if (env.provenance !== "SIMULATED" || env.schema !== schema) throw new CatalogueError(`${file.name}: not a SIMULATED ${schema} fixture`);
  const checked = validate(env.data);
  if (!checked.ok) throw new CatalogueError(`${file.name}: ${formatIssues(checked.errors)}`);
  return checked.value;
}

function derive(listings: ReadonlyMap<string, ListingRecord>, d: DerivedListing): ListingRecord {
  const base = listings.get(d.base);
  if (base === undefined) throw new CatalogueError(`derived listing ${d.id}: unknown base ${d.base}`);
  const record: ListingRecord = {
    ...base,
    id: d.id,
    url: d.url,
    ...(d.merchant === undefined ? {} : { merchant: d.merchant }),
    ...(d.seller === undefined ? {} : { seller: d.seller }),
    ...(d.scameterRef === undefined ? {} : { scameter_ref: d.scameterRef }),
    provenance: "SIMULATED",
  };
  const checked = validateListingRecord(record);
  if (!checked.ok) throw new CatalogueError(`derived listing ${d.id}: ${formatIssues(checked.errors)}`);
  return checked.value;
}

export function buildCatalogue(sources: CatalogueSources, table: ScenarioTable): Catalogue {
  const fixtures = sources.listings.map((f) => readEnvelope(f, "listing-record", validateListingRecord));
  const byId = new Map(fixtures.map((l) => [l.id, l] as const));
  if (byId.size !== fixtures.length) throw new CatalogueError("two listing fixtures share an id");
  const derived = table.derivedListings.map((d) => derive(byId, d));
  const listings = new Map([...byId, ...derived.map((l) => [l.id, l] as const)]);
  const reference = readEnvelope(sources.referenceCart, "cart", validateCart).proposed_at;
  const shared = sources.captures.map((f) => readEnvelope(f, "scameter-capture", validateScameterCapture));
  const own = (sources.shop?.captures ?? []).map((f) => readEnvelope(f, "scameter-capture", validateScameterCapture));
  const clash = own.find((c) => shared.some((other) => other.capture_ref === c.capture_ref));
  if (clash !== undefined) throw new CatalogueError(`shop capture ${clash.capture_ref} repeats a fixture capture`);
  const captures = [...shared, ...own];
  const ages = captures.map((c) => [c.capture_ref, { capture: c, ageMs: Math.max(0, Date.parse(reference) - Date.parse(c.captured_at)) }] as const);
  const shop: Shop = sources.shop === undefined ? new Map() : buildShop(sources.shop.items, new Set(captures.map((c) => c.capture_ref)));
  const catalogue: Catalogue = { listings, captures: new Map(ages), shop };
  checkTable(catalogue, table);
  return catalogue;
}

function checkTable(catalogue: Catalogue, table: ScenarioTable): void {
  const wanted = [...Object.values(table.scenarios).flatMap((s) => s.listings), ...table.custom.listings];
  const missing = wanted.filter((id) => !catalogue.listings.has(id));
  if (missing.length > 0) throw new CatalogueError(`booth.json names unknown listing(s): ${[...new Set(missing)].join(", ")}`);
}

const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

/** A fresh capture is stamped again once it would be this close to the R9 age limit [F52]: one hour of margin. */
const RESTAMP_MARGIN_MS = 60 * 60 * 1000;

/**
 * Scameter lookup for the cart builder: the capture restamped to keep its fixture age against the clock. A stamp is
 * kept for the life of the lookup, so the same listing gives the same cart each time (the repeat check compares carts;
 * a stamp that moved every second would make every ask look new). A fresh capture is stamped again before it could
 * age past the R9 limit, so "fresh" stays fresh on a booth left running for days; a stale one keeps its stamp.
 */
export function scameterLookup(catalogue: Catalogue, clock: Clock): ScameterLookup {
  const limitMs = ENGINE_CONFIG.seller.max_capture_age_s * 1000 - RESTAMP_MARGIN_MS;
  const stampedFrom = new Map<string, number>();
  return (ref) => {
    const hit = catalogue.captures.get(ref);
    if (hit === undefined) return null;
    const now = clock.now().getTime();
    const kept = stampedFrom.get(ref);
    const from = kept !== undefined && (hit.ageMs >= limitMs || now - kept + hit.ageMs < limitMs) ? kept : now;
    stampedFrom.set(ref, from);
    return { ...hit.capture, captured_at: iso(from - hit.ageMs) };
  };
}

export function listingsFor(catalogue: Catalogue, ids: readonly string[]): readonly ListingRecord[] {
  return ids.map((id) => {
    const listing = catalogue.listings.get(id);
    if (listing === undefined) throw new CatalogueError(`unknown listing ${id}`);
    return listing;
  });
}

const totalOf = (l: ListingRecord): number => (l.items[0]?.unit_price_minor ?? 0) + l.shipping_minor + l.fees_minor;

/**
 * Shipping overflow from any starting point: when the stored listing would fit what is left, a SIMULATED copy is priced
 * so the subtotal is HK$21 under what is left and the shipping tips it over (the F22 shape). On HK$541 left the copy is
 * the stored HK$520 + HK$30 listing itself [F22].
 */
export function overflowListing(base: ListingRecord, remainingMinor: number): ListingRecord {
  const [first, ...rest] = base.items;
  if (first === undefined || totalOf(base) > remainingMinor) return base;
  const price = remainingMinor - OVERFLOW_UNDER_MINOR;
  if (price < 1 || price + base.shipping_minor + base.fees_minor <= remainingMinor) return base;
  return { ...base, items: [{ ...first, unit_price_minor: price }, ...rest], provenance: "SIMULATED" };
}

/** Try to trick the agent: the derived visitor listing with the visitor's text as its description (only the judge reads it). */
export function visitorListing(base: ListingRecord, text: string, now: Date): ListingRecord {
  return { ...base, text, observed_at: iso(now.getTime()), provenance: "SIMULATED" };
}
