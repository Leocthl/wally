// buildCart (A-31): propose_cart input + listing records -> Cart, validated against cart.schema.json before it is
// returned. Deterministic apart from ids.cartId(); never throws (an unexpected fault is invalid_cart, I5).
import { sha256Hex } from "../crypto/jcs";
import type { Cart, ListingRecord } from "../generated";
import { formatIssues, validateCart } from "../schema";
import { findListing, priceItems, totalsOf, type Totals } from "./listing";
import { checkProposal, reject } from "./proposal";
import { scameterOf } from "./scameter";
import type { BuildCart, BuildCartInput, BuildCartResult } from "./types";

interface Parts {
  readonly record: ListingRecord;
  readonly items: Cart["items"];
  readonly totals: Totals;
  readonly scameter: Cart["scameter"];
}

function assemble(input: BuildCartInput, parts: Parts): Cart {
  const { record, items, totals, scameter } = parts;
  return {
    id: input.ids.cartId(),
    mandate_id: input.mandate.id,
    agent: input.mandate.agent, // asserted by the orchestrator, never by the planner (I4)
    proposed_at: input.now.toISOString(),
    merchant: { name: record.merchant.name, domain: record.merchant.domain },
    items,
    ...totals,
    fx: null, // HKD only: listing-record.schema.json pins the currency and config has no FX source [F3]
    currency: "HKD",
    listing: { url: record.url, text_sha256: sha256Hex(record.text), observed_at: record.observed_at },
    price_observed_at: record.observed_at,
    scameter,
    provenance: record.provenance,
  };
}

function buildSteps(input: BuildCartInput): BuildCartResult {
  const proposal = checkProposal(input.proposal, input.maxQty);
  if (!proposal.ok) return proposal;
  const record = findListing(proposal.value.listing_url, input.listings, input.mandate);
  if (!record.ok) return record;
  const items = priceItems(proposal.value, record.value);
  if (!items.ok) return items;
  const totals = totalsOf(items.value, record.value);
  if (!totals.ok) return totals;
  const scameter = scameterOf(record.value, input.scameterByRef);
  if (!scameter.ok) return scameter;
  const cart = assemble(input, { record: record.value, items: items.value, totals: totals.value, scameter: scameter.value });
  const checked = validateCart(cart);
  if (!checked.ok) return reject("cart_invalid", `built cart fails cart.schema.json: ${formatIssues(checked.errors)}`);
  return { ok: true, cart: checked.value };
}

export const buildCart: BuildCart = (input) => {
  try {
    return buildSteps(input);
  } catch (err) {
    return reject("cart_invalid", `the cart could not be built: ${err instanceof Error ? err.message : "unknown error"}`);
  }
};
