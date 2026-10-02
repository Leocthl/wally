// Hard facts the request states in English words (quantity, size, colour) are checked in code against the
// model's choice, the same parsers the rule planner uses. A disagreement means no proposal, so the app asks the
// shopper. The parsers read English only, so a Chinese or Cantonese request is left to the model's reading,
// and the engine, the rail limit and the judge still decide (I5).
import type { ListingRecord } from "@laisee/core/generated";
import { candidatesFromListing, type PlannerCandidate } from "../candidates";
import { parseQuantity } from "../parse-request";
import { matchingVariants } from "../variants";
import type { ChosenItem } from "./answer";

/** Words of the item name, so "2 cotton tees" counts as a quantity for a cotton tee. */
function nounsOf(candidate: PlannerCandidate): readonly string[] {
  return candidate.baseName.toLowerCase().match(/[a-z]{3,}/g) ?? [];
}

/** Numbers that belong to the title ("3 pairs") are a pack size, not a quantity. */
function packPhrases(candidate: PlannerCandidate): readonly string[] {
  return (candidate.title.toLowerCase().match(/\d+\s+[a-z]+/g) ?? []).map((p) => p.replace(/\s+/g, " "));
}

/** null when every chosen item agrees with what the request states; otherwise the reason it does not. */
export function factCheck(request: string, listing: ListingRecord, items: readonly ChosenItem[]): string | null {
  const candidates = candidatesFromListing(listing);
  for (const item of items) {
    const candidate = candidates.find((c) => c.title === item.title);
    if (candidate === undefined) return "an item is not in the listing";
    const family = candidates.filter((c) => c.baseName.toLowerCase() === candidate.baseName.toLowerCase());
    if (!matchingVariants(request, family).some((v) => v.title === candidate.title)) return "the request states a size or colour this item does not have";
    const stated = parseQuantity(request, nounsOf(candidate), packPhrases(candidate));
    if (stated.kind === "invalid") return "the request states a quantity that cannot be used";
    if (stated.kind === "qty" && stated.qty !== item.qty) return "the quantity differs from the one the request states";
  }
  return null;
}
