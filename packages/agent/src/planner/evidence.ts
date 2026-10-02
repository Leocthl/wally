// Evidence gate: a listed item is a candidate for a request only if the request names it. Keywords and a
// small synonym table, no model. Colours, materials, sizes, quantities and filler never count as naming an
// item. Code applies this before Laya is asked anything, so it can only tighten the planner (I5).
import type { ItemFamily } from "./candidates";

const IGNORED: ReadonlySet<string> = new Set([
  // filler
  "a", "an", "the", "of", "and", "or", "for", "in", "on", "to", "me", "my", "i", "id", "im", "want", "wanna", "buy", "get", "got", "need",
  "some", "any", "please", "pls", "like", "is", "it", "with", "from", "at", "by", "as", "be", "this", "that", "these", "those", "you", "your",
  "we", "us", "something", "anything", "whatever", "cheap", "cheaper", "cheapest", "hk", "hkd", "verified", "seller", "sellers",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  // sizes and units
  "size", "small", "medium", "large", "xl", "xxl", "xxxl", "xs", "xxs", "pair", "pack", "set", "pcs", "pc", "piece", "unit", "item",
  // colours
  "black", "white", "grey", "gray", "navy", "blue", "red", "green", "olive", "khaki", "beige", "cream", "brown", "tan", "pink", "purple",
  "yellow", "orange", "maroon", "burgundy", "teal", "charcoal", "silver", "gold", "light", "dark", "bright", "pale", "deep",
  // materials and product modifiers
  "cotton", "denim", "fleece", "wool", "leather", "linen", "silk", "nylon", "polyester", "graphic", "plain", "basic", "classic", "soft",
  "heavyweight", "lightweight", "midweight", "ankle", "crew", "slim", "regular", "relaxed", "boxy", "oversized", "simulated", "observed",
]);

/** Spelling and word-choice variants that name the same product. Keys and values are singular. */
const SYNONYMS: Readonly<Record<string, string>> = {
  shirt: "tee", tshirt: "tee", top: "tee",
  hoody: "hoodie", sweatshirt: "hoodie", pullover: "hoodie",
  coat: "jacket", bomber: "jacket", windbreaker: "jacket", outerwear: "jacket",
  trouser: "pant", jean: "pant",
  sneaker: "shoe", trainer: "shoe",
  hat: "cap", beanie: "cap",
};

function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(sses|shes|ches|xes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

function canonical(word: string): string {
  const one = singular(word);
  return SYNONYMS[word] ?? SYNONYMS[one] ?? one;
}

/** Words that can name a product, canonical singular form, unique, in order of first appearance. */
export function contentWords(text: string): readonly string[] {
  const raw = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const kept = raw.filter((w) => w.length > 1 && !IGNORED.has(w) && !IGNORED.has(singular(w))).map(canonical);
  return kept.filter((w, i) => kept.indexOf(w) === i);
}

/**
 * True when the request names the item: it shares the item's head noun (the last content word of the name),
 * or at least two content words. One shared modifier is not enough ("a gift for my friend" does not name
 * the gift card bundle).
 */
export function hasEvidence(request: string, family: ItemFamily): boolean {
  const wanted = new Set(contentWords(request));
  const name = contentWords(family.baseName);
  const shared = name.filter((w) => wanted.has(w));
  const head = name.at(-1);
  return shared.length >= 2 || (head !== undefined && shared.includes(head));
}
