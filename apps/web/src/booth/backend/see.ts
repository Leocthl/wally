// Show Wally a photo: a picture (or the chips) in, a few typed words and four similar simulated shop items out. The
// local model reads the picture only when this booth has one (features.see "model"); every other path runs on code: the
// colour plates the page worked out, the item-type chips, and the matcher (@wally/agent/vision). Nothing here buys,
// seals or logs anything: the shopper picks a match and the normal ask pipeline decides. The picture is held in memory
// for the one call and never stored; only its size, dimensions, time and a reason word are logged.
import { matchShelf, type Attributes, type Color, type Described, type PaletteEntry, type Scored } from "@wally/agent/vision";
import type { SeeAttributes, SeeResult, ShopMatch } from "../../api/types";
import type { SeeInput } from "./validate";
import type { Shop } from "./shop";
import type { BackendLogger } from "./types";

/** Reads one picture into typed words (describeImage on the local model); null when this booth has no picture reader. */
export type PictureReader = (bytes: Uint8Array) => Promise<Described>;

export interface SeeDeps {
  readonly shop: Shop;
  readonly reader: PictureReader | null;
  readonly logger: BackendLogger;
}

/** Colours taken from the colour plates when nothing else names them. */
const PLATE_COLORS = 2;

const EMPTY: SeeAttributes = { kind: null, colors: [], pattern: null, fit: null, style: [] };

const plateColors = (palette: readonly PaletteEntry[]): readonly Color[] => palette.slice(0, PLATE_COLORS).map((e) => e.color);

/** The model's words as the screen's chips: an unknown fit is no preference. */
function fromModel(read: Attributes, palette: readonly PaletteEntry[]): SeeAttributes {
  return {
    kind: read.kind,
    colors: read.colors.length > 0 ? read.colors : plateColors(palette),
    pattern: read.pattern,
    fit: read.fit === "unknown" ? null : read.fit,
    style: read.style,
  };
}

function toMatch(scored: Scored, shop: Shop): ShopMatch | null {
  const entry = shop.get(scored.item.id);
  if (entry === undefined) return null;
  const { item } = scored;
  return {
    listingId: item.id,
    kind: item.kind,
    colors: item.colors,
    pattern: item.pattern,
    fit: item.fit,
    style: item.style,
    merchantName: entry.merchantName,
    priceMinor: item.priceMinor,
    totalMinor: item.priceMinor + item.shippingMinor,
    score: scored.score,
    reasons: scored.reasons,
  };
}

function matchesFor(attributes: SeeAttributes, shop: Shop): readonly ShopMatch[] {
  const shelf = [...shop.values()].map((e) => e.item);
  return matchShelf(attributes, shelf).flatMap((scored) => {
    const match = toMatch(scored, shop);
    return match === null ? [] : [match];
  });
}

const logLine = (read: Described): string =>
  `see: ${read.bytes} bytes${read.width === null ? "" : ` ${read.width}x${read.height}`}, ${Math.round(read.latencyMs)} ms, ${read.reason}${read.failure === null ? "" : ` (${read.failure})`}`;

export async function see(input: SeeInput, deps: SeeDeps): Promise<SeeResult> {
  const { shop } = deps;
  if (input.attributes !== null) {
    return { source: "chips", attributes: input.attributes, palette: input.palette, matches: matchesFor(input.attributes, shop) };
  }
  const fallback: SeeAttributes = { ...EMPTY, colors: plateColors(input.palette) };
  if (input.image === null || deps.reader === null) {
    return { source: "palette", attributes: fallback, palette: input.palette, matches: [] };
  }
  const read = await deps.reader(input.image.bytes);
  deps.logger.info(logLine(read));
  if (read.attributes === null) return { source: "palette", attributes: fallback, palette: input.palette, matches: [], notice: "model_failed" };
  const attributes = fromModel(read.attributes, input.palette);
  if (attributes.kind === "not_clothing") return { source: "model", attributes, palette: input.palette, matches: [], notice: "not_clothing" };
  return { source: "model", attributes, palette: input.palette, matches: matchesFor(attributes, shop) };
}
