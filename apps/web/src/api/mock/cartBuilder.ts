// Cart builder (A-31 analog): prices a proposal from the listing record, never from planner text (I4).
// total = subtotal + shipping + fees (+ fx fee); the engine boundary check is re-run by the tests.
import type { Cart, ListingRecord, Mandate, ProposeCartInput } from "@wally/core/generated";
import { sha256Hex } from "./hash";

export interface BuildCartArgs {
  readonly id: string;
  readonly mandate: Mandate;
  readonly listing: ListingRecord;
  readonly proposal: ProposeCartInput;
  readonly now: Date;
  readonly scameter: Cart["scameter"];
}

export class CartBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CartBuildError";
  }
}

function priceItems(listing: ListingRecord, proposal: ProposeCartInput): Cart["items"] {
  const lines = proposal.items.map((wanted) => {
    const found = listing.items.find((i) => i.title === wanted.title);
    if (!found) throw new CartBuildError(`item not on the listing: ${wanted.title}`);
    if (!Number.isInteger(wanted.qty) || wanted.qty < 1) throw new CartBuildError("quantity must be a positive integer");
    return { title: found.title, category: found.category, qty: wanted.qty, unit_price_minor: found.unit_price_minor };
  });
  const [first, ...rest] = lines;
  if (!first) throw new CartBuildError("a cart needs at least one item");
  return [first, ...rest];
}

export function buildCart(args: BuildCartArgs): Cart {
  const { listing, proposal, now, mandate } = args;
  if (proposal.listing_url !== listing.url) throw new CartBuildError("listing_url does not match the listing record");
  const items = priceItems(listing, proposal);
  const subtotal = items.reduce((sum, i) => sum + i.qty * i.unit_price_minor, 0);
  const at = now.toISOString().replace(".000Z", "Z");
  return {
    id: args.id,
    mandate_id: mandate.id,
    agent: mandate.agent,
    proposed_at: at,
    merchant: { name: listing.merchant.name, domain: listing.merchant.domain },
    items,
    subtotal_minor: subtotal,
    shipping_minor: listing.shipping_minor,
    fees_minor: listing.fees_minor,
    fx: null,
    total_minor: subtotal + listing.shipping_minor + listing.fees_minor,
    currency: "HKD",
    listing: { url: listing.url, text_sha256: sha256Hex(listing.text), observed_at: at },
    price_observed_at: at,
    scameter: args.scameter,
    provenance: listing.provenance,
  };
}
