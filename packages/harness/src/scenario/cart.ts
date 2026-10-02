// Stand-in for the core cart builder (TASKS A-31). Prices a propose_cart input from the listing record,
// never from the planner. Lane A's builder replaces this through the factory; the shape is the Cart schema.
import type { Cart, ListingRecord, Mandate, ProposeCartInput, ScameterCapture } from "@laisee/core/generated";
import { FX_FEE_BP } from "../config";
import { sha256Hex } from "../canonical";
import { convertMinor, percentOfBp } from "./money";

export interface FxPricing {
  readonly listedCurrency: string;
  readonly listedAmountMinor: number;
  /** HKD per unit of the listed currency, decimal string. SIMULATED in the harness. */
  readonly rate: string;
  readonly rateSourceRef: string;
}

export interface CartBuildInput {
  readonly cartId: string;
  readonly mandate: Mandate;
  readonly listing: ListingRecord;
  readonly proposal: ProposeCartInput;
  /** null = no Scameter capture for this seller (NOT_CHECKED). */
  readonly scameter: ScameterCapture | null;
  readonly now: Date;
  readonly fx?: FxPricing;
}

export type CartBuildResult = { readonly ok: true; readonly cart: Cart } | { readonly ok: false; readonly reason: string };
export type CartBuilder = (input: CartBuildInput) => CartBuildResult;

type CartItem = Cart["items"][number];

function priceItems(input: CartBuildInput): readonly CartItem[] | string {
  const { listing, proposal, fx } = input;
  if (proposal.listing_url !== listing.url) return "invalid_cart: listing_url does not match the listing record";
  if (fx !== undefined && proposal.items.length !== 1) return "invalid_cart: an fx cart prices exactly one item";
  const items: CartItem[] = [];
  for (const wanted of proposal.items) {
    const found = listing.items.find((i) => i.title === wanted.title);
    if (!found) return `invalid_cart: no item titled "${wanted.title}" in the listing record`;
    const unit = fx === undefined ? found.unit_price_minor : convertMinor(fx.listedAmountMinor, fx.rate);
    items.push({ title: found.title, category: found.category, qty: wanted.qty, unit_price_minor: unit });
  }
  return items;
}

function scameterOf(capture: ScameterCapture | null): Cart["scameter"] {
  if (capture === null) return { state: "NOT_CHECKED", capture_ref: null, captured_at: null, searched: [] };
  return { state: capture.state, capture_ref: capture.capture_ref, captured_at: capture.captured_at, searched: [...capture.searched] };
}

/** The Cart schema's boundary check holds by construction: subtotal and total are computed here, in integers. */
export function buildCart(input: CartBuildInput): CartBuildResult {
  const priced = priceItems(input);
  if (typeof priced === "string") return { ok: false, reason: priced };
  const [first, ...rest] = priced;
  if (!first) return { ok: false, reason: "invalid_cart: no items" };
  const { listing, fx } = input;
  const subtotal = priced.reduce((acc, i) => acc + i.qty * i.unit_price_minor, 0);
  const fxBlock: Cart["fx"] =
    fx === undefined
      ? null
      : {
          listed_currency: fx.listedCurrency,
          listed_amount_minor: fx.listedAmountMinor,
          rate: fx.rate,
          rate_observed_at: listing.observed_at,
          rate_source_ref: fx.rateSourceRef,
          fee_minor: percentOfBp(subtotal, FX_FEE_BP),
          fee_ref: "F3.fx_settled_hkd",
        };
  const cart: Cart = {
    id: input.cartId,
    mandate_id: input.mandate.id,
    agent: input.mandate.agent,
    proposed_at: input.now.toISOString().replace(".000Z", "Z"),
    merchant: { name: listing.merchant.name, domain: listing.merchant.domain },
    items: [first, ...rest],
    subtotal_minor: subtotal,
    shipping_minor: listing.shipping_minor,
    fees_minor: listing.fees_minor,
    fx: fxBlock,
    total_minor: subtotal + listing.shipping_minor + listing.fees_minor + (fxBlock?.fee_minor ?? 0),
    currency: "HKD",
    listing: { url: listing.url, text_sha256: sha256Hex(listing.text), observed_at: listing.observed_at },
    price_observed_at: listing.observed_at,
    scameter: scameterOf(input.scameter),
    provenance: listing.provenance,
  };
  return { ok: true, cart };
}
