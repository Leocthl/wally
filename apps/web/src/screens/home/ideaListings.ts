// What the demo shop lists for each idea on Home: the shop, the price and the shipping. Read from the same SIMULATED listing
// files the booth sells from (data/fixtures/listings), so the card, the preview and the purchase cannot disagree about the
// price, and nothing here invents a number. A file whose shape is not what this expects gives no listing (the card and the
// preview then simply show no price); test/ideaListings.test.ts pins all six.
import hoodie from "@fixtures/listings/flagged-seller-hoodie.json";
import graphic from "@fixtures/listings/injected-tee.json";
import earbuds from "@fixtures/listings/off-category-earbuds.json";
import socks from "@fixtures/listings/apparel-socks.json";
import tee from "@fixtures/listings/apparel-tee.json";
import jacket from "@fixtures/listings/streetwear-jacket.json";
import { plainName } from "../run/model/item";
import type { IdeaId } from "./ideas";

export interface IdeaListing {
  /** The shop's name without the "(SIMULATED)" tag the fixtures carry; the chip says it. */
  readonly shop: string;
  /** What the first item costs, in minor units. */
  readonly priceMinor: number;
  readonly shippingMinor: number;
  /** Item plus shipping: what the shopper would pay. */
  readonly totalMinor: number;
}

const FILES: Readonly<Record<IdeaId, unknown>> = { tee, socks, jacket, hoodie, graphic, earbuds };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);
const isMinor = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** The listing in a fixture envelope, or null when the file is not a SIMULATED listing with a shop, a first item and amounts. */
export function readIdeaListing(file: unknown): IdeaListing | null {
  if (!isRecord(file) || file["provenance"] !== "SIMULATED" || !isRecord(file["data"])) return null;
  const { merchant, items, shipping_minor: shipping } = file["data"];
  const first = Array.isArray(items) ? (items[0] as unknown) : undefined;
  if (!isRecord(merchant) || typeof merchant["name"] !== "string" || !isRecord(first)) return null;
  const price = first["unit_price_minor"];
  if (!isMinor(price) || !isMinor(shipping)) return null;
  return { shop: plainName(merchant["name"]), priceMinor: price, shippingMinor: shipping, totalMinor: price + shipping };
}

const LISTINGS: Readonly<Record<IdeaId, IdeaListing | null>> = {
  tee: readIdeaListing(FILES.tee),
  socks: readIdeaListing(FILES.socks),
  jacket: readIdeaListing(FILES.jacket),
  hoodie: readIdeaListing(FILES.hoodie),
  graphic: readIdeaListing(FILES.graphic),
  earbuds: readIdeaListing(FILES.earbuds),
};

export function ideaListing(id: IdeaId): IdeaListing | null {
  return LISTINGS[id];
}
