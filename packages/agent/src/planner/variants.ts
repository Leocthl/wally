// Hard variant facts, applied in code before Laya is asked a soft question: a size or colour the shopper
// stated must match. A dimension the item has no options for is not checked (the listing says nothing).
import type { PlannerCandidate } from "./candidates";
import { colourMatches, parseColours, parseSizes } from "./parse-request";

function sizeFits(v: PlannerCandidate, wanted: readonly string[], listed: ReadonlySet<string>): boolean {
  if (wanted.length === 0 || listed.size === 0) return true;
  return v.size !== null && wanted.includes(v.size);
}

function colourFits(v: PlannerCandidate, wanted: readonly string[], listed: ReadonlySet<string>): boolean {
  if (wanted.length === 0 || listed.size === 0) return true;
  const own = v.colour;
  return own !== null && wanted.some((c) => colourMatches(c, own));
}

/** Variants that match every size and colour the request states; may be empty (variant unavailable). */
export function matchingVariants(request: string, variants: readonly PlannerCandidate[]): readonly PlannerCandidate[] {
  const sizes = parseSizes(request);
  const colours = parseColours(request);
  const listedSizes = new Set(variants.flatMap((v) => (v.size === null ? [] : [v.size])));
  const listedColours = new Set(variants.flatMap((v) => (v.colour === null ? [] : [v.colour])));
  return variants.filter((v) => sizeFits(v, sizes, listedSizes) && colourFits(v, colours, listedColours));
}
