// Structured candidates from listing records (title, category, price, shipping, fees). The planner never
// reads the listing text: it is untrusted data that goes to the judge, not to the planner.
import type { ListingRecord } from "@wally/core/generated";
import type { PlannerListing } from "@wally/core/ports";
import { parseColours, parseSizes } from "./parse-request";

export interface PlannerCandidate {
  readonly listingId: string;
  readonly listingUrl: string;
  /** Exact title from the listing record: the only thing a proposal may name. */
  readonly title: string;
  /** Title without the variant parts and the SIMULATED marker. */
  readonly baseName: string;
  readonly category: string;
  readonly unitPriceMinor: number;
  readonly shippingMinor: number;
  readonly feesMinor: number;
  readonly size: string | null;
  readonly colour: string | null;
}

export interface ItemFamily {
  readonly key: string;
  readonly baseName: string;
  readonly listingUrl: string;
  readonly variants: readonly PlannerCandidate[];
}

const MARKER = /\s*\((?:simulated|observed)\)\s*$/i;
const SEGMENT_SPLIT = /\s*,\s*|\s+[/|]\s+|\s+[-–]\s+/;
const COLOUR_ONLY = /^(?:(?:light|dark|bright|pale|deep)\s+)?(?:black|white|gr[ae]y|navy|blue|red|green|olive|khaki|beige|cream|brown|tan|pink|purple|yellow|orange|maroon|burgundy|teal|charcoal|silver|gold)(?:\s+(?:black|white|gr[ae]y|navy|blue|red|green))?$/i;
const SIZE_ONLY = /^(?:size\s+)?(?:xxxl|3xl|xxl|2xl|xl|xxs|xs|[sml]|small|medium|large|extra large|\d{2}(?:\.5)?)$/i;

export interface ParsedTitle {
  readonly baseName: string;
  readonly size: string | null;
  readonly colour: string | null;
}

/** Splits a listing title such as "Cotton tee, black, M (SIMULATED)" into base name, colour and size. */
export function parseTitle(title: string): ParsedTitle {
  const clean = title.replace(MARKER, "").trim();
  const [head = "", ...rest] = clean.split(SEGMENT_SPLIT).map((s) => s.trim()).filter((s) => s.length > 0);
  const sizeSegment = rest.find((s) => SIZE_ONLY.test(s));
  const colourSegment = rest.find((s) => COLOUR_ONLY.test(s));
  const kept = rest.filter((s) => s !== sizeSegment && s !== colourSegment);
  const baseName = [head, ...kept].join(", ") || clean || title.trim() || title;
  const size = sizeSegment === undefined ? null : (parseSizes(sizeSegment.replace(/^(?!size)/i, "size ")).at(0) ?? null);
  const colour = colourSegment === undefined ? null : (parseColours(colourSegment).join(" ") || null);
  return { baseName, size, colour };
}

export function candidatesFromListing(record: ListingRecord): readonly PlannerCandidate[] {
  return record.items.map((item) => ({
    listingId: record.id,
    listingUrl: record.url,
    title: item.title,
    ...parseTitle(item.title),
    category: item.category,
    unitPriceMinor: item.unit_price_minor,
    shippingMinor: record.shipping_minor,
    feesMinor: record.fees_minor,
  }));
}

/**
 * Candidates for the listings the context names, looked up by exact url in the catalogue. A listing the
 * catalogue does not know yields nothing (no structure, no proposal); a repeated listing counts once.
 */
export function resolveCandidates(
  listings: readonly PlannerListing[],
  catalogue: ReadonlyMap<string, ListingRecord>,
): readonly PlannerCandidate[] {
  const urls = [...new Set(listings.map((l) => l.url))];
  return urls.flatMap((url) => {
    const record = catalogue.get(url);
    return record === undefined ? [] : candidatesFromListing(record);
  });
}

function familyKey(c: PlannerCandidate): string {
  return `${c.listingUrl}|${c.baseName.toLowerCase()}`;
}

/** Variants of one product (same listing, same base name) form one family; order of first appearance. */
export function groupFamilies(candidates: readonly PlannerCandidate[]): readonly ItemFamily[] {
  const keys = [...new Set(candidates.map(familyKey))];
  return keys.flatMap((key) => {
    const variants = candidates.filter((c) => familyKey(c) === key);
    const [first] = variants;
    return first === undefined ? [] : [{ key, baseName: first.baseName, listingUrl: first.listingUrl, variants }];
  });
}

/** Longest slug; unique-label suffixes come on top. */
const MAX_SLUG = 36;

/** Semantic label for a Laya option: lower case words joined by underscores, never starting with a digit. */
export function slugify(text: string): string {
  const words = text
    .replace(MARKER, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (words === "") return "item";
  const slug = (/^[a-z]/.test(words) ? words : `item_${words}`).slice(0, MAX_SLUG).replace(/_+$/g, "");
  return slug;
}

function nextFree(slug: string, taken: readonly string[]): string {
  if (!taken.includes(slug)) return slug;
  const numbered = Array.from({ length: taken.length + 1 }, (_, i) => `${slug}_${i + 2}`);
  return numbered.find((candidate) => !taken.includes(candidate)) ?? `${slug}_${taken.length + 2}`;
}

/** Makes labels unique within one question by numbering repeats: tee, tee_2, tee_3. `reserved` labels are never used. */
export function uniqueLabels(slugs: readonly string[], reserved: readonly string[] = []): readonly string[] {
  const labels = slugs.reduce<readonly string[]>((taken, slug) => [...taken, nextFree(slug, [...reserved, ...taken])], []);
  return labels;
}
