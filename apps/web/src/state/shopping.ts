// What a person can tell Wally about what they buy, as ids (the words live in i18n/onboarding.ts). It is a hint for the screens:
// it starts the first budget's categories and, when the person narrowed it, puts a matching shelf item first. It never reaches
// the engine, the planner or the judge, and it never invents an item: the picks below name scenarios that exist
// (data/scenarios/booth.json), each backed by an item in data/fixtures/listings.
import type { ScenarioId } from "../api/types";

/** The categories a budget can name (the engine's slugs, the same four as the Seal screen), in the order the first run lists them. */
export const SHOP_IDS = ["groceries", "apparel", "footwear", "electronics"] as const;
export type ShopId = (typeof SHOP_IDS)[number];

/** The most scenarios tagged "For you" at once; more than that and the tag stops meaning anything. */
export const FOR_YOU_MAX = 3;

/** Shelf scenarios that fit a category. Only electronics has an item on the shelf (the earbuds); the shelf has no groceries. */
export const SHOP_PICKS: Readonly<Partial<Record<ShopId, readonly ScenarioId[]>>> = {
  electronics: ["off_category"],
};
