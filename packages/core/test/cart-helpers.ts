// SIMULATED storyline inputs for cart-* and orchestrator-* tests: listing records, Scameter captures and the
// recorded planner proposals from data/fixtures [F20-F23].
import type { CartIdSource, ScameterLookup } from "../src/cart";
import type { ListingRecord, ProposeCartInput, ScameterCapture } from "../src/generated";
import { loadFixture } from "../src/testing/fixtures";

const listing = (name: string): ListingRecord => loadFixture(`listings/${name}.json`, "listing-record");
const capture = (name: string): ScameterCapture => loadFixture(`scameter/${name}.json`, "scameter-capture");
function proposal(name: string): ProposeCartInput {
  const recorded = loadFixture(`planner/${name}.json`, "planner-replay").proposal;
  if (recorded === null) throw new Error(`planner fixture ${name} has no proposal`);
  return recorded;
}

export const LISTING_TEE = listing("apparel-tee");
export const LISTING_HOODIE = listing("flagged-seller-hoodie");
export const LISTING_JACKET = listing("streetwear-jacket");
export const LISTING_INJECTED = listing("injected-tee");
export const LISTING_SOCKS = listing("apparel-socks");
export const LISTING_EARBUDS = listing("off-category-earbuds");
export const ALL_LISTINGS: readonly ListingRecord[] = [LISTING_TEE, LISTING_HOODIE, LISTING_JACKET, LISTING_INJECTED, LISTING_SOCKS, LISTING_EARBUDS];

export const CAPTURES: readonly ScameterCapture[] = ["demo-apparel", "demo-gadgets", "demo-outlet", "demo-streetwear", "flagged-seller", "stale"].map(capture);

export const PROPOSAL_A1 = proposal("attempt-1");
export const PROPOSAL_A2 = proposal("attempt-2");
export const PROPOSAL_A3 = proposal("attempt-3");
export const PROPOSAL_A3B = proposal("attempt-3b");
export const PROPOSAL_A4 = proposal("attempt-4");

export function lookupOf(captures: readonly ScameterCapture[] = CAPTURES): ScameterLookup {
  return (ref) => captures.find((c) => c.capture_ref === ref);
}

/** Cart ids crt_<prefix>000001, crt_<prefix>000002, ... */
export function sequentialCartIds(prefix = "test"): CartIdSource {
  let n = 0;
  return { cartId: () => `crt_${prefix}${String((n += 1)).padStart(6, "0")}` };
}

export const fixedCartId = (id: string): CartIdSource => ({ cartId: () => id });
