// Taste as a hint on Try asking: the cards that fit the person's style (or what they shop for) come first inside their
// group, and up to three carry a "For you" tag. Only order and tags change: every card stays, none is added, and a card does
// exactly what it did (the scenario, the rules and the verdict are the same). Pure.
import type { ScenarioId } from "../../api/types";
import type { Profile } from "../../state/profile";
import { FOR_YOU_MAX, SHOP_PICKS, STYLE_PICKS } from "../../state/taste";
import type { TryItem, TryScenario } from "./tryCatalog";

export interface RankedTry {
  readonly items: readonly TryItem[];
  /** The cards to tag "For you": the best fits, at most FOR_YOU_MAX, in the order they appear. */
  readonly forYou: ReadonlySet<TryScenario>;
}

/** How well each shelf scenario fits the profile (absent = not at all): a pick near the head of a style's list fits better than one near its tail. */
export function fitScores(profile: Profile): ReadonlyMap<ScenarioId, number> {
  const shopPicks = profile.shopFor.flatMap((s) => {
    const list = SHOP_PICKS[s];
    return list ? [list] : [];
  });
  const picks = [...profile.styles.map((s) => STYLE_PICKS[s]), ...shopPicks];
  const scores = new Map<ScenarioId, number>();
  for (const list of picks) list.forEach((id, at) => scores.set(id, (scores.get(id) ?? 0) + list.length - at));
  return scores;
}

export function rankTryItems(items: readonly TryItem[], profile: Profile | null): RankedTry {
  const scores = profile === null ? new Map<ScenarioId, number>() : fitScores(profile);
  if (scores.size === 0) return { items, forYou: new Set() };
  const score = (item: TryItem): number => scores.get(item.id) ?? 0;
  const groups = [...new Set(items.map((i) => i.group))];
  // Array.prototype.sort is stable: equal scores keep the catalogue order.
  const ordered = groups.flatMap((group) => items.filter((i) => i.group === group).sort((a, b) => score(b) - score(a)));
  const best = items
    .filter((i) => score(i) > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, FOR_YOU_MAX);
  return { items: ordered, forYou: new Set(best.map((i) => i.id)) };
}
