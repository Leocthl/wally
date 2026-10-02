// Turns a listing record into the JudgeInput the orchestrator would build for it. The real cart builder is
// lane A's (core); this synthetic one prices the first item at quantity 1 so fits and tests have a valid Cart.
import { createHash } from "node:crypto";
import type { Cart, ListingRecord, Mandate } from "@laisee/core/generated";
import type { JudgeInput } from "@laisee/core/ports";

export type ScameterState = Cart["scameter"]["state"];

/** Placeholder ids shaped like the fixtures' (SIMULATED, F59). */
const PLACEHOLDER_MANDATE_ID = "mnd_demoM0";
const PLACEHOLDER_AGENT = "did:key:z6MkDemoAgentKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

export const sha256Hex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

function scameterFor(state: ScameterState, listing: ListingRecord): Cart["scameter"] {
  return state === "NOT_CHECKED"
    ? { state, capture_ref: null, captured_at: null, searched: [] }
    : { state, capture_ref: `SIM-fit-${listing.id}`, captured_at: listing.observed_at, searched: ["url"] };
}

export function cartFromListing(listing: ListingRecord, scameterState: ScameterState): Cart {
  const [item] = listing.items;
  const subtotal = item.unit_price_minor;
  return {
    id: `crt_fit${sha256Hex(listing.id).slice(0, 10)}`,
    mandate_id: PLACEHOLDER_MANDATE_ID,
    agent: PLACEHOLDER_AGENT,
    proposed_at: listing.observed_at,
    merchant: { name: listing.merchant.name, domain: listing.merchant.domain },
    items: [{ title: item.title, category: item.category, qty: 1, unit_price_minor: item.unit_price_minor }],
    subtotal_minor: subtotal,
    shipping_minor: listing.shipping_minor,
    fees_minor: listing.fees_minor,
    fx: null,
    total_minor: subtotal + listing.shipping_minor + listing.fees_minor,
    currency: "HKD",
    listing: { url: listing.url, text_sha256: sha256Hex(listing.text), observed_at: listing.observed_at },
    price_observed_at: listing.observed_at,
    scameter: scameterFor(scameterState, listing),
    provenance: "SIMULATED",
  };
}

export function judgeInputFromListing(listing: ListingRecord, mandate: Mandate, scameterState: ScameterState): JudgeInput {
  const cart = cartFromListing(listing, scameterState);
  return { intentText: mandate.intent_text, rules: mandate.rules, cart, listingText: listing.text, scameter: cart.scameter };
}
