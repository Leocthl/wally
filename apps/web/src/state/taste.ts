// What a person can tell Wally about their taste, as ids (the words live in i18n/onboarding.ts). Taste is a hint for the
// screens: it re-orders and tags what is already on the shelf and starts the first budget's form (which the person reviews
// and signs). It never reaches the engine, the planner or the judge, and it never invents an item: the picks below name scenarios that exist
// (data/scenarios/booth.json), each backed by an item in data/fixtures/listings.
import type { ScenarioId } from "../api/types";

export const STYLE_IDS = ["basics", "streetwear", "sporty", "smart", "cozy"] as const;
export type StyleId = (typeof STYLE_IDS)[number];

/** Colour names only: the swatch drawn for each is in screens/onboarding/swatches.ts. */
export const COLOUR_IDS = ["black", "white", "grey", "navy", "olive", "sand", "rust", "sky"] as const;
export type ColourId = (typeof COLOUR_IDS)[number];

export const SIZE_LETTERS = ["XS", "S", "M", "L", "XL"] as const;
export type SizeLetter = (typeof SIZE_LETTERS)[number];

/** EU shoe sizes, in twos: a picker of five that fits one row on the narrowest phone. */
export const SHOE_SIZES = ["36", "38", "40", "42", "44"] as const;
export type ShoeSize = (typeof SHOE_SIZES)[number];

/** The categories a budget can name (the engine's slugs, the same four as the Seal screen). */
export const SHOP_IDS = ["apparel", "footwear", "groceries", "electronics"] as const;
export type ShopId = (typeof SHOP_IDS)[number];

/** The most scenarios tagged "For you" at once; more than that and the tag stops meaning anything. */
export const FOR_YOU_MAX = 3;

/**
 * Shelf scenarios that fit a style, best fit first. The shelf is a cotton tee and ankle socks (basics, smart casual,
 * sporty), a denim jacket and a graphic tee (streetwear) and a fleece hoodie (cozy). It has no shoes, groceries, colours
 * or sizes, so nothing else is claimed.
 */
export const STYLE_PICKS: Readonly<Record<StyleId, readonly ScenarioId[]>> = {
  basics: ["normal", "small"],
  streetwear: ["overflow", "injected"],
  sporty: ["small"],
  smart: ["normal"],
  cozy: ["flagged"],
};

/** Shelf scenarios that fit what a person shops for. Only electronics has an item on the shelf (the earbuds). */
export const SHOP_PICKS: Readonly<Partial<Record<ShopId, readonly ScenarioId[]>>> = {
  electronics: ["off_category"],
};
