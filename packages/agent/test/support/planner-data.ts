// Test data for the planner: the storyline listing fixtures plus in-memory listings with variants
// (the shared listing fixtures have no size or colour options). All SIMULATED, no real shop or person.
import type { ListingRecord } from "@laisee/core/generated";
import type { PlannerContext, PlannerStop } from "@laisee/core/ports";
import { loadFixture } from "@laisee/core/testing/fixtures";

export const LISTING_FIXTURES = {
  tee: "listings/apparel-tee.json",
  socks: "listings/apparel-socks.json",
  hoodie: "listings/flagged-seller-hoodie.json",
  jacket: "listings/streetwear-jacket.json",
  injected: "listings/injected-tee.json",
  earbuds: "listings/off-category-earbuds.json",
} as const;

export type ListingKey = keyof typeof LISTING_FIXTURES;

export function fixtureListing(key: ListingKey): ListingRecord {
  return loadFixture(LISTING_FIXTURES[key], "listing-record");
}

const tee = (colour: string, size: string): ListingRecord["items"][number] => ({
  title: `Cotton tee, ${colour}, ${size} (SIMULATED)`,
  category: "apparel",
  unit_price_minor: 25900,
});

/** In-memory listing with a size and colour grid: black S/M/L and white M/L. */
export const VARIANT_LISTING: ListingRecord = {
  id: "lst_variantTee",
  url: "https://demo-apparel.example/p/tee-variants",
  merchant: { name: "Demo Apparel (SIMULATED)", domain: "demo-apparel.example" },
  items: [tee("black", "S"), tee("black", "M"), tee("black", "L"), tee("white", "M"), tee("white", "L")],
  shipping_minor: 0,
  fees_minor: 0,
  currency: "HKD",
  seller: "Demo Apparel (SIMULATED), shop since 2019, 30-day returns",
  text: "Cotton tee (SIMULATED). Black and white, sizes S to L. Free shipping.",
  observed_at: "2026-10-03T02:30:00Z",
  scameter_ref: "SIM-scameter-demo-apparel",
  provenance: "SIMULATED",
};

/** Same product family as the fixture tee: a second tee so a request for "a tee" is a near tie. */
export const GRAPHIC_TEE_LISTING: ListingRecord = {
  ...VARIANT_LISTING,
  id: "lst_graphicTee",
  url: "https://demo-apparel.example/p/graphic-tee",
  items: [{ title: "Graphic tee (SIMULATED)", category: "apparel", unit_price_minor: 15000 }],
  text: "Graphic tee (SIMULATED). Heavyweight cotton.",
};

export function ctxOf(intentText: string, records: readonly ListingRecord[]): PlannerContext {
  return { intentText, listings: records.map((r) => ({ url: r.url, text: r.text })) };
}

export function catalogueOf(...records: readonly ListingRecord[]): readonly ListingRecord[] {
  return records;
}

export const ALL_FIXTURE_LISTINGS: readonly ListingRecord[] = (Object.keys(LISTING_FIXTURES) as ListingKey[]).map(fixtureListing);

/** HK$541 left after attempt 1 [F21]: the R3 stop of the storyline [F22]. */
export const R3_STOP: PlannerStop = { templateId: "R3.over_remaining", remainingMinor: 54100 };

export const OPTS = { timeoutMs: 20_000 } as const; // F33
