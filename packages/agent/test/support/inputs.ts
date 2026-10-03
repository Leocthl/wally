// JudgeInput builders from the SIMULATED fixtures, as the orchestrator would pass them.
import type { Cart, ListingRecord } from "@wally/core/generated";
import type { JudgeInput } from "@wally/core/ports";
import { listFixtureFiles, loadFixture } from "@wally/core/testing/fixtures";
import { cartFromListing, type ScameterState } from "../../src/judge/fit/inputs";

export const DEMO_LISTINGS = [
  "apparel-tee",
  "apparel-socks",
  "streetwear-jacket",
  "flagged-seller-hoodie",
  "injected-tee",
  "off-category-earbuds",
] as const;
export type DemoListing = (typeof DEMO_LISTINGS)[number];

export const mandate = loadFixture("mandate/m0.json", "mandate");

export function demoListing(name: DemoListing): ListingRecord {
  return loadFixture(`listings/${name}.json`, "listing-record");
}

function demoCart(listing: ListingRecord, scameterState: ScameterState): Cart {
  const carts = listFixtureFiles()
    .filter((f) => f.startsWith("carts/"))
    .map((f) => loadFixture(f, "cart"));
  return carts.find((c) => c.listing.url === listing.url) ?? cartFromListing(listing, scameterState);
}

export function demoInput(name: DemoListing): JudgeInput {
  const listing = demoListing(name);
  const cart = demoCart(listing, "NO_RECORD");
  return { intentText: mandate.intent_text, rules: mandate.rules, cart, listingText: listing.text, scameter: cart.scameter };
}

/** A minimal valid input with the given listing text. */
export function inputWithText(listingText: string, name: DemoListing = "apparel-tee"): JudgeInput {
  return { ...demoInput(name), listingText };
}
