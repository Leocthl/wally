// Hard facts the request states in English words (quantity, size, colour) are checked in code against the
// model's choice, the same parsers the rule planner uses. A disagreement means no proposal, so the app asks the
// shopper. The parsers read English only, so a Chinese or Cantonese request is left to the model's reading,
// and the engine, the rail limit and the judge still decide (I5).
import type { ListingRecord } from "@laisee/core/generated";
import { candidatesFromListing, groupFamilies, type PlannerCandidate } from "../candidates";
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

/** Words that never name a product. Materials, colours and styles are kept: they tell two tees apart. */
const STOP: ReadonlySet<string> = new Set([
  "a", "an", "the", "i", "id", "im", "me", "my", "we", "you", "it", "its", "is", "be", "to", "of", "and", "or", "for", "in", "on", "at", "with",
  "want", "wanna", "would", "like", "need", "buy", "get", "got", "add", "find", "please", "pls", "some", "any", "one", "this", "that", "just",
  "simulated", "observed", "size", "pair", "pack", "set", "piece", "item", "know", "over", "budget", "but", "even", "if", "s", "t",
]);

/** Spelling and word-choice variants that name the same product (singular keys and values). */
const SYNONYMS: Readonly<Record<string, string>> = {
  shirt: "tee", tshirt: "tee", top: "tee", hoody: "hoodie", sweatshirt: "hoodie", pullover: "hoodie",
  coat: "jacket", bomber: "jacket", windbreaker: "jacket", trouser: "pant", jean: "pant", sneaker: "shoe", trainer: "shoe",
};

function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

function productWords(text: string): ReadonlySet<string> {
  const words = (text.toLowerCase().match(/[a-z]+/g) ?? []).map(singular).map((w) => SYNONYMS[w] ?? w);
  return new Set(words.filter((w) => !STOP.has(w)));
}

/**
 * English tie guard: true when another listed product fits the request's English words at least as well as the
 * chosen one ("a tee" with a cotton tee and a graphic tee listed). The model then has picked one of two equal
 * readings, so the app asks the shopper instead. A request with no English product word is left to the model.
 */
export function tiedWithAnother(request: string, listings: readonly ListingRecord[], chosenTitle: string): boolean {
  const families = groupFamilies(listings.flatMap(candidatesFromListing));
  const wanted = productWords(request);
  const score = (baseName: string): number => [...productWords(baseName)].filter((w) => wanted.has(w)).length;
  const chosen = families.find((f) => f.variants.some((v) => v.title === chosenTitle));
  if (chosen === undefined) return false;
  const best = score(chosen.baseName);
  return best > 0 && families.some((f) => f !== chosen && score(f.baseName) >= best);
}
