// What step two ("What can Wally buy for you?") holds, and what is kept of it (pure). The four kinds start ticked, which is what
// "any category" means. A person who ticked all four, or none, did not narrow anything: that is kept as no choice, so a profile is
// never made of a default, and the first budget's form starts from all four either way (screens/onboarding/budgetModel.ts).
import { SHOP_IDS, type ShopId } from "../../state/shopping";

/** The ticks a visitor starts step two with: everything, or the narrowing they kept on an earlier visit. */
export function tickedAtStart(kept: readonly ShopId[] | undefined): readonly ShopId[] {
  return kept === undefined || kept.length === 0 ? SHOP_IDS : kept;
}

/** The categories to keep in the profile: the ticks when the person narrowed them to some of the four, otherwise none. */
export function narrowed(ticked: readonly ShopId[]): readonly ShopId[] {
  return ticked.length === 0 || ticked.length === SHOP_IDS.length ? [] : ticked;
}
