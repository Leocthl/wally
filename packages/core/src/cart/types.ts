// Cart builder contract (A-31, docs/02 section 3): propose_cart input + listing record -> Cart. Prices come
// only from the ListingRecord; planner text and the planner's own numbers never set a money field (I4).
import type { Cart, ListingRecord, Mandate, ScameterCapture } from "../generated";
import type { ProposeCartInput } from "../ports";

/** Why a proposal could not become a Cart. Every one means: no Decision is made (cart.schema.json invalid_cart). */
export type InvalidCartCode =
  /** The proposal fails propose-cart.schema.json (shape, lengths, item count). */
  | "proposal_invalid"
  /** No items in the proposal. */
  | "items_empty"
  /** qty below 1, not an integer, or above the bound (default: the propose-cart schema maximum). */
  | "qty_invalid"
  /** The same title twice in one proposal. Rejected, never merged: the planner must name each item once. */
  | "duplicate_item"
  /** listing_url matches no listing record given to the builder. */
  | "listing_unknown"
  /** Two listing records share the proposal's url. */
  | "listing_ambiguous"
  /** The matching listing record fails listing-record.schema.json. */
  | "listing_invalid"
  /** A title the listing record does not sell (exact match only). */
  | "item_unknown"
  /** The mandate budget is not in the cart currency. */
  | "currency_mismatch"
  /** The listing is not priced in HKD and neither the schemas nor config give an FX source [F3]. */
  | "fx_unsupported"
  /** The listing's Scameter capture fails scameter-capture.schema.json. */
  | "scameter_invalid"
  /** The listing's Scameter capture is about another merchant domain. */
  | "scameter_mismatch"
  /** A money sum is not a safe non-negative integer. */
  | "amount_invalid"
  /** The built cart fails cart.schema.json (for example a malformed cart id from the id source). */
  | "cart_invalid";

export interface CartBuilt {
  readonly ok: true;
  readonly cart: Cart;
}

export interface CartRejected {
  readonly ok: false;
  readonly reason: "invalid_cart";
  readonly code: InvalidCartCode;
  /** Plain-language detail for logs and the console. Never contains card data. */
  readonly detail: string;
}

export type BuildCartResult = CartBuilt | CartRejected;

/** Capture by capture_ref; undefined or null = no capture known (cart.scameter NOT_CHECKED). */
export type ScameterLookup = (captureRef: string) => ScameterCapture | null | undefined;

export interface CartIdSource {
  /** A fresh cart id, ^crt_[A-Za-z0-9]{6,40}$ (mandate.schema.json CartId). Deterministic in tests. */
  cartId(): string;
}

export interface BuildCartInput {
  /** Untrusted planner output. Validated against propose-cart.schema.json here. */
  readonly proposal: ProposeCartInput;
  /** Listing records the planner chose from; the only source of prices. */
  readonly listings: readonly ListingRecord[];
  readonly mandate: Mandate;
  /** proposed_at. */
  readonly now: Date;
  readonly ids: CartIdSource;
  readonly scameterByRef: ScameterLookup;
  /** Upper bound on qty per item. Default: propose-cart.schema.json items.qty.maximum. */
  readonly maxQty?: number;
}

/** Pure apart from ids.cartId(); never throws. */
export type BuildCart = (input: BuildCartInput) => BuildCartResult;
