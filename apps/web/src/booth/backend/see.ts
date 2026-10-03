// Show Wally a photo: a picture (or the chips) in, a few typed words and four similar simulated shop items out. The
// local model reads the picture only when this booth has one (features.see "model"); every other path runs on code: the
// colour plates the page worked out, the item-type chips, and the matcher (@wally/agent/vision). Nothing here buys,
// seals or logs anything: the shopper picks a match and the normal ask pipeline decides. The picture is held in memory
// for the one call and never stored; only its size, dimensions, time and a reason word are logged.
import { matchShelf, readRequest, type Attributes, type Color, type Described, type PaletteEntry, type Scored } from "@wally/agent/vision";
import type { SeeAttributes, SeeResult, ShopMatch } from "../../api/types";
import type { SeeInput } from "./validate";
import type { Shop } from "./shop";
import type { BackendLogger } from "./types";

/** Reads one picture into typed words (describeImage on the local model); null when this booth has no picture reader. */
export type PictureReader = (bytes: Uint8Array) => Promise<Described>;

/**
 * One picture is read at a time [F96]: the model server has two slots and the planner and the judge share them, so a
 * flood of pictures would delay a purchase. A picture that arrives while another is being read is not read at all; it
 * comes back as "busy", which see() turns into the colour plates and the chips. The guard is free again when the read
 * ends, whether it answered, failed or threw.
 */
export function oneAtATime(read: PictureReader): PictureReader {
  let reading = false;
  return async (bytes) => {
    if (reading) return { attributes: null, reason: "busy", bytes: bytes.length, width: null, height: null, latencyMs: 0, model: null, failure: null };
    reading = true;
    try {
      return await read(bytes);
    } finally {
      reading = false;
    }
  };
}

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

function matchesFor(attributes: SeeAttributes, shop: Shop, maxPriceMinor: number | null = null): readonly ShopMatch[] {
  const shelf = [...shop.values()].map((e) => e.item);
  return matchShelf({ ...attributes, maxPriceMinor }, shelf).flatMap((scored) => {
    const match = toMatch(scored, shop);
    return match === null ? [] : [match];
  });
}

/** The price limit the result reports: present only when there is one. */
const limited = (maxPriceMinor: number | null): { readonly maxPriceMinor?: number } => (maxPriceMinor === null ? {} : { maxPriceMinor });

/**
 * The shopper's own words, read by the fixed keyword tables (packages/agent text reader): no model on any host. The same
 * chips and the same matcher as a picture, so the cards are the same; a limit in the words leaves dearer items out.
 */
function fromWords(text: string, shop: Shop): SeeResult {
  const reading = readRequest(text);
  const attributes: SeeAttributes = { kind: reading.kind, colors: reading.colors, pattern: reading.pattern, fit: reading.fit, style: reading.style };
  const base = { source: "text", attributes, palette: [], ...limited(reading.maxPriceMinor) } as const;
  if (reading.kind === null) return { ...base, matches: [], notice: reading.unsold ? "not_sold" : "nothing_found" };
  return { ...base, matches: matchesFor(attributes, shop, reading.maxPriceMinor) };
}

/** A reader that throws (it should not) is a read that failed: the chips path, never an error to the shopper. */
const FAILED_READ = (bytes: number): Described => ({ attributes: null, reason: "model_unavailable", bytes, width: null, height: null, latencyMs: 0, model: null, failure: null });

const logLine = (read: Described): string =>
  `see: ${read.bytes} bytes${read.width === null ? "" : ` ${read.width}x${read.height}`}, ${Math.round(read.latencyMs)} ms, ${read.reason}${read.failure === null ? "" : ` (${read.failure})`}`;

export async function see(input: SeeInput, deps: SeeDeps): Promise<SeeResult> {
  const { shop } = deps;
  if (input.text !== null) return fromWords(input.text, shop);
  if (input.attributes !== null) {
    return { source: "chips", attributes: input.attributes, palette: input.palette, ...limited(input.maxPriceMinor), matches: matchesFor(input.attributes, shop, input.maxPriceMinor) };
  }
  const fallback: SeeAttributes = { ...EMPTY, colors: plateColors(input.palette) };
  if (input.image === null || deps.reader === null) {
    return { source: "palette", attributes: fallback, palette: input.palette, matches: [] };
  }
  const read = await deps.reader(input.image.bytes).catch(() => FAILED_READ(input.image?.bytes.length ?? 0));
  deps.logger.info(logLine(read));
  if (read.attributes === null) return { source: "palette", attributes: fallback, palette: input.palette, matches: [], notice: "model_failed" };
  const attributes = fromModel(read.attributes, input.palette);
  if (attributes.kind === "not_clothing") return { source: "model", attributes, palette: input.palette, matches: [], notice: "not_clothing" };
  return { source: "model", attributes, palette: input.palette, matches: matchesFor(attributes, shop) };
}
