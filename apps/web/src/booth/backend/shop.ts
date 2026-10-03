// The photo shelf: SIMULATED shop items a picture can be matched to (data/photo-shelf/items.json). Each item becomes a
// ListingRecord the normal pipeline buys from (planner proposal fixed by code, then judge, rules R1 to R12 and the
// one-off card). They live apart from `Catalogue.listings` on purpose: the Ask shelf, every booth scenario and the
// recorded planner sets are built from `listings` alone, so none of them can ever see a photo item. Portable.
import type { ListingRecord } from "@wally/core/generated";
import { formatIssues, validateListingRecord } from "@wally/core/schema";
import { isColor, isFit, isPattern, isStyle, SHOP_KINDS, type Kind, type ShelfItem } from "@wally/agent/vision";

export interface ShopEntry {
  /** What the matcher compares. */
  readonly item: ShelfItem;
  /** What the cart builder prices from and the judge reads. */
  readonly listing: ListingRecord;
  readonly merchantName: string;
}

/** Listing id to entry, in file order. */
export type Shop = ReadonlyMap<string, ShopEntry>;

export class ShopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopError";
  }
}

/** A parsed fixture file: `name` is only used in messages. */
export interface ShopFile {
  readonly name: string;
  readonly raw: unknown;
}

type Obj = Readonly<Record<string, unknown>>;

const LISTING_ID = /^lst_[A-Za-z0-9]{3,40}$/;
const FOOTWEAR: ReadonlySet<Kind> = new Set<Kind>(["sneakers", "boots"]);

const isObj = (value: unknown): value is Obj => value !== null && typeof value === "object" && !Array.isArray(value);

function obj(value: unknown, where: string): Obj {
  if (!isObj(value)) throw new ShopError(`${where} must be an object`);
  return value;
}

function str(o: Obj, key: string, where: string): string {
  const value = o[key];
  if (typeof value !== "string" || value.trim() === "") throw new ShopError(`${where}.${key} must be a non-empty string`);
  return value;
}

function minor(o: Obj, key: string, where: string): number {
  const value = o[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new ShopError(`${where}.${key} must be a whole number of minor units`);
  return value;
}

function words<T extends string>(o: Obj, key: string, where: string, known: (v: unknown) => v is T, min: number, max: number): readonly T[] {
  const value = o[key];
  if (!Array.isArray(value) || value.length < min || value.length > max || !value.every(known)) throw new ShopError(`${where}.${key} must hold ${min} to ${max} known words`);
  return value;
}

const isShopKind = (value: unknown): value is Kind => typeof value === "string" && (SHOP_KINDS as readonly string[]).includes(value);

/** The category a mandate's rules see: shoes are footwear, everything else the shop sells is apparel. */
export const categoryOf = (kind: Kind): "apparel" | "footwear" => (FOOTWEAR.has(kind) ? "footwear" : "apparel");

function entryOf(raw: unknown, index: number, merchants: Obj, observedAt: string, captureRefs: ReadonlySet<string>): ShopEntry {
  const where = `items[${index}]`;
  const o = obj(raw, where);
  const id = str(o, "id", where);
  if (!LISTING_ID.test(id)) throw new ShopError(`${where}.id is not a listing id`);
  const kind = o["kind"];
  if (!isShopKind(kind)) throw new ShopError(`${where}.kind must be one of ${SHOP_KINDS.join(", ")}`);
  const pattern = o["pattern"];
  const fit = o["fit"];
  if (!isPattern(pattern)) throw new ShopError(`${where}.pattern is not a known pattern`);
  if (!isFit(fit) || fit === "unknown") throw new ShopError(`${where}.fit must be slim, regular, relaxed or oversized`);
  const merchantKey = str(o, "merchant", where);
  const merchant = obj(merchants[merchantKey], `merchants.${merchantKey}`);
  const scameterRef = str(merchant, "scameter_ref", `merchants.${merchantKey}`);
  if (!captureRefs.has(scameterRef)) throw new ShopError(`${where}: no Scameter capture ${scameterRef}`);
  const name = str(merchant, "name", `merchants.${merchantKey}`);
  const domain = str(merchant, "domain", `merchants.${merchantKey}`);
  const title = str(o, "title", where);
  const price = minor(o, "price_minor", where);
  const shipping = minor(merchant, "shipping_minor", `merchants.${merchantKey}`);
  const listing: ListingRecord = {
    id,
    url: `https://${domain}/p/${id.slice(4)}`,
    merchant: { name, domain },
    items: [{ title, category: categoryOf(kind), unit_price_minor: price }],
    shipping_minor: shipping,
    fees_minor: 0,
    currency: "HKD",
    seller: str(merchant, "seller", `merchants.${merchantKey}`),
    text: str(o, "text", where),
    observed_at: observedAt,
    scameter_ref: scameterRef,
    provenance: "SIMULATED",
  };
  const checked = validateListingRecord(listing);
  if (!checked.ok) throw new ShopError(`${where} (${id}): ${formatIssues(checked.errors)}`);
  const item: ShelfItem = {
    id,
    kind,
    colors: words(o, "colors", where, isColor, 1, 2),
    pattern,
    fit,
    style: words(o, "style", where, isStyle, 0, 2),
    priceMinor: price,
    shippingMinor: shipping,
  };
  return { item, listing: checked.value, merchantName: name };
}

/**
 * Reads data/photo-shelf/items.json. `captureRefs` are the Scameter captures the catalogue holds: an item naming one
 * that is missing is a start-up error, never a silent "not checked". Ids, urls and titles must each be unique.
 */
export function buildShop(file: ShopFile, captureRefs: ReadonlySet<string>): Shop {
  const env = obj(file.raw, file.name);
  if (env["provenance"] !== "SIMULATED" || env["schema"] !== "photo-shelf") throw new ShopError(`${file.name}: not a SIMULATED photo-shelf fixture`);
  const data = obj(env["data"], `${file.name}.data`);
  const merchants = obj(data["merchants"], "merchants");
  const observedAt = str(data, "observed_at", "data");
  const rows = data["items"];
  if (!Array.isArray(rows) || rows.length === 0) throw new ShopError("items must be a non-empty list");
  const entries = rows.map((row, index) => entryOf(row, index, merchants, observedAt, captureRefs));
  for (const field of [(e: ShopEntry) => e.item.id, (e: ShopEntry) => e.listing.url, (e: ShopEntry) => e.listing.items[0]?.title ?? ""]) {
    const seen = entries.map(field);
    const repeated = seen.find((value, index) => seen.indexOf(value) !== index);
    if (repeated !== undefined) throw new ShopError(`two photo-shelf items share ${repeated}`);
  }
  return new Map(entries.map((entry) => [entry.item.id, entry] as const));
}
