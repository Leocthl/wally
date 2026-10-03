// The words the photo reader may answer with. Every field is an enum or a short bounded list: the model never writes
// free text, a price or a brand, and a picture that says "ignore your rules" can only ever produce these values. The
// shop fixtures (data/fixtures/shop) and the matcher use the same words, so a picture and an item compare directly.

export const KINDS = [
  "tee",
  "shirt",
  "polo",
  "sweater",
  "hoodie",
  "jacket",
  "jeans",
  "trousers",
  "shorts",
  "dress",
  "skirt",
  "sneakers",
  "boots",
  "bag",
  "other",
  "not_clothing",
] as const;
export type Kind = (typeof KINDS)[number];

export const COLORS = [
  "black",
  "white",
  "grey",
  "navy",
  "blue",
  "light_blue",
  "green",
  "olive",
  "red",
  "orange",
  "yellow",
  "pink",
  "purple",
  "brown",
  "beige",
  "cream",
  "denim",
] as const;
export type Color = (typeof COLORS)[number];

export const PATTERNS = ["plain", "stripes", "check", "print", "logo"] as const;
export type Pattern = (typeof PATTERNS)[number];

export const FITS = ["slim", "regular", "relaxed", "oversized", "unknown"] as const;
export type Fit = (typeof FITS)[number];

export const STYLES = ["basics", "streetwear", "sporty", "smart_casual", "cozy"] as const;
export type Style = (typeof STYLES)[number];

/** Most colours and style tags one picture may carry (the answer grammar caps both). */
export const MAX_COLORS = 3;
export const MAX_STYLES = 2;

/** The kinds a person can ask the shop for: everything but the two "no match possible" words. */
export const SHOP_KINDS: readonly Kind[] = KINDS.filter((k) => k !== "other" && k !== "not_clothing" && k !== "bag");

/** What the model read from one picture, after code has checked every field. */
export interface Attributes {
  readonly kind: Kind;
  /** Most dominant first; may be empty when the model named none that is a known colour. */
  readonly colors: readonly Color[];
  /** null when the model's word was not a known pattern. */
  readonly pattern: Pattern | null;
  readonly fit: Fit;
  readonly style: readonly Style[];
}

const memberOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === "string" && (list as readonly string[]).includes(value);

export const isKind = memberOf(KINDS);
export const isColor = memberOf(COLORS);
export const isPattern = memberOf(PATTERNS);
export const isFit = memberOf(FITS);
export const isStyle = memberOf(STYLES);
