// Deterministic request parsing: sizes, colours and quantity from the shopper request. Keyword rules
// only, no model. These are hard facts the planner applies in code before Laya is asked a soft question.

/** propose-cart.schema.json: items[].qty maximum. */
export const MAX_QTY = 20;

const SIZE_ALIASES: Readonly<Record<string, string>> = {
  small: "s",
  medium: "m",
  large: "l",
  "2xl": "xxl",
  "3xl": "xxxl",
};

const COLOUR_WORDS = [
  "black", "white", "grey", "gray", "navy", "blue", "red", "green", "olive", "khaki", "beige", "cream", "brown",
  "tan", "pink", "purple", "yellow", "orange", "maroon", "burgundy", "teal", "charcoal", "silver", "gold",
] as const;
const COLOUR_MODIFIERS = ["light", "dark", "bright", "pale", "deep"] as const;

interface Found {
  readonly at: number;
  readonly value: string;
}

/** Same-length blanking, so later rules cannot match inside a span an earlier rule consumed. */
function blank(text: string, start: number, length: number): string {
  return text.slice(0, start) + " ".repeat(length) + text.slice(start + length);
}

function canonicalSize(raw: string): string {
  const lower = raw.toLowerCase();
  return SIZE_ALIASES[lower] ?? lower;
}

interface SizeRule {
  readonly pattern: RegExp;
  readonly group: number;
  readonly fixed?: string;
}

const SIZE_RULES: readonly SizeRule[] = [
  // Linear on long whitespace runs (audit): one optional separator group instead of two adjacent \s* runs.
  { pattern: /\b(?:size|sz)\s*(?:[:-]\s*)?(xxxl|xxl|xl|xxs|xs|[sml]|\d{1,2}(?:\.5)?|small|medium|large)(?![a-z0-9])/gi, group: 1 },
  { pattern: /\b(?:eu|uk|us)\s*(\d{2}(?:\.5)?)\b/gi, group: 1 },
  { pattern: /\b(?:extra|x)[\s-]+large\b/gi, group: 0, fixed: "xl" },
  { pattern: /\b(xxxl|3xl|xxl|2xl|xl|xxs|xs)\b/gi, group: 1 },
  { pattern: /(?:\bin\s+|,\s*)(small|medium|large)\b/gi, group: 1 },
  { pattern: /\b(small|medium|large)\s+size\b/gi, group: 1 },
  { pattern: /\b(small|medium|large)[\s.!?]*$/gi, group: 1 },
  { pattern: /(?<![A-Za-z0-9'’])([SML])(?![A-Za-z0-9'’])/g, group: 1 },
];

function applySizeRule(text: string, rule: SizeRule): { text: string; found: readonly Found[] } {
  const matches = [...text.matchAll(rule.pattern)];
  const found = matches.map((m) => ({ at: m.index ?? 0, value: rule.fixed ?? canonicalSize(m[rule.group] ?? "") }));
  const blanked = matches.reduce((acc, m) => blank(acc, m.index ?? 0, m[0].length), text);
  return { text: blanked, found };
}

function orderedUnique(found: readonly Found[]): readonly string[] {
  const sorted = [...found].sort((a, b) => a.at - b.at);
  return sorted.map((f) => f.value).filter((v, i, all) => all.indexOf(v) === i);
}

/** Canonical sizes named in the text, in order of appearance: xxs..xxxl or a two-digit number. */
export function parseSizes(text: string): readonly string[] {
  const { found } = SIZE_RULES.reduce(
    (state, rule) => {
      const step = applySizeRule(state.text, rule);
      return { text: step.text, found: [...state.found, ...step.found] };
    },
    { text, found: [] as readonly Found[] },
  );
  return orderedUnique(found);
}

const COLOUR_PATTERN = new RegExp(`\\b(?:(${COLOUR_MODIFIERS.join("|")})\\s+)?(${COLOUR_WORDS.join("|")})\\b`, "gi");

/** Colours named in the text (canonical lower case, `gray` as `grey`, optional light or dark modifier). */
export function parseColours(text: string): readonly string[] {
  const found = [...text.matchAll(COLOUR_PATTERN)].map((m) => {
    const colour = (m[2] ?? "").toLowerCase() === "gray" ? "grey" : (m[2] ?? "").toLowerCase();
    return { at: m.index ?? 0, value: m[1] ? `${m[1].toLowerCase()} ${colour}` : colour };
  });
  return orderedUnique(found);
}

/** A requested colour matches a variant colour when every word of the request is in the variant's. */
export function colourMatches(requested: string, variantColour: string): boolean {
  const have = new Set(variantColour.split(" "));
  return requested.split(" ").every((w) => have.has(w));
}

export type QuantityResult =
  | { readonly kind: "none" }
  | { readonly kind: "qty"; readonly qty: number }
  | { readonly kind: "invalid" };

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20,
};
const UNIT_WORDS = ["pc", "pcs", "piece", "pieces", "pack", "packs", "set", "sets", "unit", "units", "item", "items"];
const NUMBER_PATTERN = `\\d{1,3}|${Object.keys(NUMBER_WORDS).join("|")}`;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nounForms(noun: string): readonly string[] {
  const base = escapeRegExp(noun.toLowerCase());
  const singular = noun.toLowerCase().endsWith("s") && noun.length > 3 ? [escapeRegExp(noun.toLowerCase().slice(0, -1))] : [];
  return [base, `${base}s`, `${base}es`, ...singular];
}

function toNumber(raw: string): number {
  return NUMBER_WORDS[raw] ?? Number.parseInt(raw, 10);
}

function quantityMatches(masked: string, nouns: readonly string[]): readonly number[] {
  const heads = [...UNIT_WORDS.map(escapeRegExp), ...nouns.filter((n) => n.length > 0).flatMap(nounForms)].join("|");
  const guard = "(?<![\\w$.#-])(?<!\\$\\s)(?<!size\\s{0,2})";
  const notMoney = "(?!\\s*(?:hk\\$|hkd|usd|rmb|cny|dollars?|bucks|\\$))";
  const withNoun = new RegExp(
    `${guard}(${NUMBER_PATTERN})${notMoney}\\s+(?:of\\s+)?(?:(?:the|these|those|my|your)\\s+)?(?:[a-z'-]+\\s+){0,2}?(?:${heads})(?![a-z])`,
    "g",
  );
  const times = /(?<![\w$.#])(\d{1,3})\s*[x×](?![a-z0-9])/g;
  const prefixed = /(?<![\w])[x×]\s*(\d{1,3})(?![\w])/g;
  return [withNoun, times, prefixed].flatMap((re) => [...masked.matchAll(re)].map((m) => toNumber(m[1] ?? "")));
}

/**
 * Quantity stated in the request. `nouns` are words of the chosen item (so "2 cotton tees" counts and
 * "3 hoodies" does not); `ignore` are phrases that belong to the title, such as a pack size ("3 pairs").
 * A missing number means none (the caller uses 1); 0, above MAX_QTY or two different numbers is invalid.
 */
export function parseQuantity(text: string, nouns: readonly string[] = [], ignore: readonly string[] = []): QuantityResult {
  const masked = ignore.reduce((acc, phrase) => (phrase.trim() === "" ? acc : acc.split(phrase.toLowerCase()).join(" ")), text.toLowerCase());
  const numbers = quantityMatches(masked, nouns);
  if (numbers.length === 0) return { kind: "none" };
  const distinct = [...new Set(numbers)];
  const only = distinct[0];
  if (distinct.length !== 1 || only === undefined || !Number.isInteger(only) || only < 1 || only > MAX_QTY) return { kind: "invalid" };
  return { kind: "qty", qty: only };
}
