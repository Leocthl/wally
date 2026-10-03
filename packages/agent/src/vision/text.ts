// The typed request reader: what a shopper types or says ("white tee under HK$150", "黑色牛仔褲 $400以下", "AirPods"),
// read by fixed keyword tables into the same words the picture reader answers with (kind, colours, pattern, fit, style)
// and a price limit. No model and no randomness, so it works offline, on the on-device build and in the native shells,
// and gives the same answer every time. The text is untrusted: it can only ever come out as words from the lists and one
// whole number, so "ignore your rules" is just text that matches nothing. Only the start of a long text is read [F105].
import { COLOR_TERMS, FIT_TERMS, KIND_TERMS, PATTERN_TERMS, STYLE_TERMS, UNSOLD_WORDS, type Term } from "./text-words";
import { readPriceLimit } from "./text-money";
import { MAX_COLORS, MAX_STYLES, type Color, type Fit, type Kind, type Pattern, type Style } from "./vocab";

/** How much of a text is read, in characters: the Ask field's own limit [F56]. */
export const MAX_READ_CHARS = 1_000;

export interface RequestReading {
  /** What the shopper asked for, from the kinds the shop sells (and bags, which it does not); null when no kind word was used. */
  readonly kind: Kind | null;
  /** In the order said, at most three. */
  readonly colors: readonly Color[];
  readonly pattern: Pattern | null;
  /** null: no preference. */
  readonly fit: Exclude<Fit, "unknown"> | null;
  readonly style: readonly Style[];
  /** The most the shopper wants to pay for the item, integer minor units; null when no limit was said. */
  readonly maxPriceMinor: number | null;
  /** A product the shop does not sell was named (earbuds, a phone, a gift card): the answer can say so. */
  readonly unsold: boolean;
}

const NOTHING: RequestReading = { kind: null, colors: [], pattern: null, fit: null, style: [], maxPriceMinor: null, unsold: false };

type Group = "kind" | "color" | "pattern" | "fit" | "style" | "unsold";

interface Hit {
  readonly group: Group;
  readonly value: string;
  readonly weak: boolean;
  readonly start: number;
  readonly end: number;
}

const isWordChar = (c: string | undefined): boolean => c !== undefined && /[a-z0-9]/.test(c);
const isPlain = (word: string): boolean => /^[a-z0-9$'\- ]+$/.test(word);

/** Every place `word` stands in `text`. A Latin word needs a word boundary on both sides (and may take a plural s or es). */
function places(text: string, word: string): readonly (readonly [number, number])[] {
  const found: (readonly [number, number])[] = [];
  const plain = isPlain(word);
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
    let end = at + word.length;
    if (plain) {
      if (isWordChar(text[at - 1])) continue;
      if (isWordChar(text[end])) {
        const plural = text.startsWith("es", end) && !isWordChar(text[end + 2]) ? 2 : text[end] === "s" && !isWordChar(text[end + 1]) ? 1 : 0;
        if (plural === 0) continue;
        end += plural;
      }
    }
    found.push([at, end]);
  }
  return found;
}

function hitsOf<T extends string>(text: string, group: Group, terms: readonly Term<T>[]): readonly Hit[] {
  return terms.flatMap((term) =>
    term.words.flatMap((word) => places(text, word).map(([start, end]) => ({ group, value: term.value, weak: term.weak === true, start, end }))),
  );
}

/** Left to right, the longest word at a place first; a word that overlaps one already taken is dropped. */
function takeNonOverlapping(hits: readonly Hit[]): readonly Hit[] {
  const ordered = [...hits].sort((a, b) => a.start - b.start || b.end - a.end);
  const taken: Hit[] = [];
  let cursor = 0;
  for (const hit of ordered) {
    if (hit.start < cursor) continue;
    taken.push(hit);
    cursor = hit.end;
  }
  return taken;
}

const valuesOf = <T extends string>(taken: readonly Hit[], group: Group): readonly T[] => taken.filter((h) => h.group === group).map((h) => h.value as T);
const distinct = <T>(values: readonly T[]): readonly T[] => values.filter((v, i) => values.indexOf(v) === i);

function firstKindHit(taken: readonly Hit[]): Hit | undefined {
  const kinds = taken.filter((h) => h.group === "kind");
  return kinds.find((h) => !h.weak) ?? kinds[0];
}

/** Where one item's description ends and the next begins: a comma, "and", "with", "plus", "or", "&", "+", 和, 同, 及, 、, ，. */
const SEPARATOR = /,|;|&|\+|\band\b|\bwith\b|\bplus\b|\bor\b|和|同|及|、|，|；|或/gu;

/**
 * When the shopper names two different kinds ("black hoodie and a white tee"), the colours, pattern, fit and style that
 * come after the join belong to the second item, not to the first one that is read. The cut is the last join before the
 * second kind. With one kind (or the same kind twice) nothing is cut.
 */
function cutAfterFirstItem(text: string, taken: readonly Hit[], first: Hit | undefined): number {
  if (first === undefined) return Number.POSITIVE_INFINITY;
  const second = taken.find((h) => h.group === "kind" && h.value !== first.value && h.start >= first.end);
  if (second === undefined) return Number.POSITIVE_INFINITY;
  const joins = [...text.slice(0, second.start).matchAll(SEPARATOR)].map((m) => m.index ?? 0);
  return joins.length === 0 ? second.start : Math.max(first.end, joins[joins.length - 1] ?? 0);
}

/** Reads one typed request. Never throws; anything it does not know is left out. */
export function readRequest(text: unknown): RequestReading {
  if (typeof text !== "string") return NOTHING;
  try {
    const lower = text.slice(0, MAX_READ_CHARS).normalize("NFKC").toLowerCase();
    const hits = [
      ...hitsOf(lower, "kind", KIND_TERMS),
      ...hitsOf(lower, "color", COLOR_TERMS),
      ...hitsOf(lower, "pattern", PATTERN_TERMS),
      ...hitsOf(lower, "fit", FIT_TERMS),
      ...hitsOf(lower, "style", STYLE_TERMS),
      ...hitsOf(lower, "unsold", [{ value: "unsold", words: UNSOLD_WORDS }]),
    ];
    const all = takeNonOverlapping(hits);
    const first = firstKindHit(all);
    const cut = cutAfterFirstItem(lower, all, first);
    const taken = all.filter((h) => h.group === "kind" || h.group === "unsold" || h.start < cut);
    return {
      kind: first === undefined ? null : (first.value as Kind),
      colors: distinct(valuesOf<Color>(taken, "color")).slice(0, MAX_COLORS),
      pattern: valuesOf<Pattern>(taken, "pattern")[0] ?? null,
      fit: valuesOf<Exclude<Fit, "unknown">>(taken, "fit")[0] ?? null,
      style: distinct(valuesOf<Style>(taken, "style")).slice(0, MAX_STYLES),
      maxPriceMinor: readPriceLimit(lower),
      unsold: all.some((h) => h.group === "unsold"),
    };
  } catch {
    return NOTHING; // never throws
  }
}
