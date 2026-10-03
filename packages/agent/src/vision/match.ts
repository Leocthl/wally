// Matching a picture to the simulated shop is plain code, not a model. Each shelf item gets a score out of 100 from
// what the picture showed: its kind (must match, or sit in the same close family), how near its colours are in CIELAB,
// and bonuses for pattern, fit and style. The top four come back with the reasons that earned them, as ids that the
// screen words in its own language. Whether an item fits the budget is a badge the screen adds, never a filter: the
// rules decide the purchase, not this list.
import { colorDistance } from "./color";
import type { Color, Fit, Kind, Pattern, Style } from "./vocab";

/** What the matcher needs to know about one simulated shop item. */
export interface ShelfItem {
  readonly id: string;
  readonly kind: Kind;
  /** One or two colours, main colour first. */
  readonly colors: readonly Color[];
  readonly pattern: Pattern;
  readonly fit: Fit;
  readonly style: readonly Style[];
  /** The item's price, integer minor units (HKD cents). */
  readonly priceMinor: number;
  readonly shippingMinor: number;
}

/** What the picture, the chips and the palette together say. Unset parts earn the neutral share of their points. */
export interface MatchQuery {
  readonly kind: Kind | null;
  /** Most dominant first. */
  readonly colors: readonly Color[];
  readonly pattern: Pattern | null;
  /** null or "unknown": no preference. */
  readonly fit: Fit | null;
  readonly style: readonly Style[];
}

export type ReasonId = "same_kind" | "close_kind" | "same_color" | "close_color" | "same_pattern" | "same_fit" | "same_style";

export interface Scored {
  readonly item: ShelfItem;
  /** 0 to 100, whole number. */
  readonly score: number;
  /** In the order the screen shows them: kind, colour, pattern, fit, style. */
  readonly reasons: readonly ReasonId[];
  /** How near the colours are, 0 to 1. */
  readonly colorFit: number;
}

/** Points out of 100 [F96]. ASSUMED weights: with colours equally near, the right kind ranks ahead of a close one; a much better colour can still lift a close kind. */
export const WEIGHTS = { kind: 50, closeKind: 25, color: 30, pattern: 8, fit: 6, style: 6 } as const;
/** [F96] Lab distance at which a colour stops counting; the score falls off as (1 - distance / this) squared. */
export const COLOR_FALLOFF = 50;
/** [F96] A colour fit at or above this reads as "same colour", at or above the lower one as "close colour". */
export const SAME_COLOR_FIT = 0.8;
export const CLOSE_COLOR_FIT = 0.2;
/** Weights of the first, second and third colour of the picture [F96]. */
const COLOR_RANK_WEIGHTS: readonly number[] = [1, 0.5, 0.25];
export const DEFAULT_LIMIT = 4;

/** Kinds that stand in for each other when the exact one is missing. */
const CLOSE_KINDS: readonly (readonly [Kind, Kind])[] = [
  ["tee", "polo"],
  ["tee", "shirt"],
  ["polo", "shirt"],
  ["sweater", "hoodie"],
  ["hoodie", "jacket"],
  ["jeans", "trousers"],
  ["trousers", "shorts"],
  ["jeans", "shorts"],
  ["dress", "skirt"],
  ["sneakers", "boots"],
];

const FIT_ORDER: readonly Fit[] = ["slim", "regular", "relaxed", "oversized"];

const closeKinds = (a: Kind, b: Kind): boolean => CLOSE_KINDS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** 1 for the same word, falling to 0 at COLOR_FALLOFF Lab units, squared so near colours stand out. */
function colorSimilarity(a: Color, b: Color): number {
  const near = Math.max(0, 1 - colorDistance(a, b) / COLOR_FALLOFF);
  return near * near;
}

/** Weighted over the picture's colours, each compared with its closest colour on the item. */
function colorFitOf(query: readonly Color[], item: readonly Color[]): number {
  const wanted = query.filter((c, i) => query.indexOf(c) === i).slice(0, COLOR_RANK_WEIGHTS.length);
  if (wanted.length === 0 || item.length === 0) return 0;
  const weights = wanted.map((_, i) => COLOR_RANK_WEIGHTS[i] ?? 0);
  const total = weights.reduce((sum, w) => sum + w, 0);
  const fit = wanted.reduce((sum, color, i) => sum + (weights[i] ?? 0) * Math.max(...item.map((c) => colorSimilarity(color, c))), 0);
  return fit / total;
}

function patternPoints(want: Pattern | null, have: Pattern): number {
  if (want === null) return WEIGHTS.pattern / 2;
  if (want === have) return WEIGHTS.pattern;
  return (want === "print" && have === "logo") || (want === "logo" && have === "print") ? WEIGHTS.pattern / 2 : 0;
}

function fitPoints(want: Fit | null, have: Fit): number {
  if (want === null || want === "unknown" || have === "unknown") return WEIGHTS.fit / 2;
  if (want === have) return WEIGHTS.fit;
  return Math.abs(FIT_ORDER.indexOf(want) - FIT_ORDER.indexOf(have)) === 1 ? WEIGHTS.fit / 2 : 0;
}

function stylePoints(want: readonly Style[], have: readonly Style[]): number {
  if (want.length === 0) return WEIGHTS.style / 2;
  return (WEIGHTS.style * want.filter((s) => have.includes(s)).length) / want.length;
}

/** The score of one item for a query, or null when its kind is neither the same nor a close one (or the query has no kind). */
export function scoreItem(query: MatchQuery, item: ShelfItem): Scored | null {
  if (query.kind === null) return null;
  const exact = query.kind === item.kind;
  if (!exact && !closeKinds(query.kind, item.kind)) return null;
  const colorFit = query.colors.length === 0 ? 0.5 : colorFitOf(query.colors, item.colors);
  const points =
    (exact ? WEIGHTS.kind : WEIGHTS.closeKind) +
    WEIGHTS.color * colorFit +
    patternPoints(query.pattern, item.pattern) +
    fitPoints(query.fit, item.fit) +
    stylePoints(query.style, item.style);
  const reasons: ReasonId[] = [
    exact ? "same_kind" : "close_kind",
    ...(query.colors.length > 0 && colorFit >= SAME_COLOR_FIT ? (["same_color"] as const) : query.colors.length > 0 && colorFit >= CLOSE_COLOR_FIT ? (["close_color"] as const) : []),
    ...(query.pattern !== null && query.pattern !== "plain" && query.pattern === item.pattern ? (["same_pattern"] as const) : []),
    ...(query.fit !== null && query.fit !== "unknown" && query.fit === item.fit ? (["same_fit"] as const) : []),
    ...(query.style.some((s) => item.style.includes(s)) ? (["same_style"] as const) : []),
  ];
  return { item, score: Math.round(points), reasons, colorFit };
}

/** Best first: score, then colour, then the exact kind, then the lower price, then id (so the order never wobbles). */
export function matchShelf(query: MatchQuery, shelf: readonly ShelfItem[], limit: number = DEFAULT_LIMIT): readonly Scored[] {
  const scored = shelf.flatMap((item) => {
    const one = scoreItem(query, item);
    return one === null ? [] : [one];
  });
  return [...scored]
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.colorFit - a.colorFit ||
        Number(b.item.kind === query.kind) - Number(a.item.kind === query.kind) ||
        a.item.priceMinor + a.item.shippingMinor - (b.item.priceMinor + b.item.shippingMinor) ||
        (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
    )
    .slice(0, Math.max(0, limit));
}

/** The badge on a card: does the whole order fit what is left? null when the budget is not known. */
export function fitsBudget(totalMinor: number, remainingMinor: number | null): boolean | null {
  return remainingMinor === null || !Number.isSafeInteger(remainingMinor) ? null : totalMinor <= remainingMinor;
}
