// Listing lookup, currency and pricing: every money field comes from the ListingRecord (docs/02 section 3).
import type { Cart, ListingRecord, Mandate, ProposeCartInput } from "../generated";
import { formatIssues, validateListingRecord } from "../schema";
import { isRecord, reject, type Step } from "./proposal";

/** The only currency the cart, the mandate and the rail carry (mandate.schema.json Currency). */
const CART_CURRENCY = "HKD";

/** The one listing record whose url equals the proposal's, schema-valid and priced in HKD. */
export function findListing(url: string, listings: readonly ListingRecord[], mandate: Mandate): Step<ListingRecord> {
  const matches = (Array.isArray(listings) ? listings : []).filter((l: unknown) => isRecord(l) && l["url"] === url);
  const [record] = matches;
  if (record === undefined) return reject("listing_unknown", "listing_url matches no listing record given to the planner");
  if (matches.length > 1) return reject("listing_ambiguous", "two listing records share the proposal's url");
  if (mandate.rules.budget.currency !== CART_CURRENCY) return reject("currency_mismatch", `the mandate budget is not in ${CART_CURRENCY}`);
  if ((record as { currency?: unknown }).currency !== CART_CURRENCY) {
    return reject("fx_unsupported", `the listing is not priced in ${CART_CURRENCY} and no FX source is configured [F3]`);
  }
  const checked = validateListingRecord(record);
  if (!checked.ok) return reject("listing_invalid", `listing record fails its schema: ${formatIssues(checked.errors)}`);
  return { ok: true, value: checked.value };
}

/** Cart items priced from the record by exact title; category from the record too. */
export function priceItems(proposal: ProposeCartInput, record: ListingRecord): Step<Cart["items"]> {
  const priced: Cart["items"][number][] = [];
  for (const wanted of proposal.items) {
    const sold = record.items.filter((i) => i.title === wanted.title);
    const [item] = sold;
    if (item === undefined) return reject("item_unknown", `the listing does not sell an item with exactly that title (item ${priced.length})`);
    if (sold.length > 1) return reject("listing_invalid", "the listing record sells two items with the same title");
    priced.push({ title: item.title, category: item.category, qty: wanted.qty, unit_price_minor: item.unit_price_minor });
  }
  const [first, ...rest] = priced;
  return first === undefined ? reject("items_empty", "the proposal names no items") : { ok: true, value: [first, ...rest] };
}

export interface Totals {
  readonly subtotal_minor: number;
  readonly shipping_minor: number;
  readonly fees_minor: number;
  readonly total_minor: number;
}

const isMoney = (v: number): boolean => Number.isSafeInteger(v) && v >= 0;

/** subtotal = sum(qty * unit price); total = subtotal + shipping + fees (+ FX fee, none: HKD only). Integers only. */
export function totalsOf(items: Cart["items"], record: ListingRecord): Step<Totals> {
  const lines = items.map((i) => i.qty * i.unit_price_minor);
  const subtotal = lines.reduce((sum, line) => sum + line, 0);
  const total = subtotal + record.shipping_minor + record.fees_minor;
  if (![...lines, subtotal, total].every(isMoney)) return reject("amount_invalid", "an amount is not a safe non-negative integer");
  return { ok: true, value: { subtotal_minor: subtotal, shipping_minor: record.shipping_minor, fees_minor: record.fees_minor, total_minor: total } };
}
