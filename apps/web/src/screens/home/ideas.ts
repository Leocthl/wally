// "Ideas for you" on Home: four items from the booth's shelf, led by the categories the person narrowed their shopping to. Every
// idea is an item the shelf really has (data/fixtures/listings), asked in the words the booth's own buy button and recording use,
// so a card shops for something that exists. A person who did not narrow anything sees the everyday picks. The categories only
// order: what an idea does is the same ask any shopper could type, and the rules decide it. Pure.
import type { LabelPair } from "../../i18n/label";
import { OB } from "../../i18n/onboarding";
import type { Profile } from "../../state/profile";
import { SHOP_PICKS, type ShopId } from "../../state/shopping";
import type { IconName } from "../../ui/icons";
import type { TryScenario } from "./tryCatalog";
import { fitScores } from "./tryRank";

export type IdeaId = "tee" | "socks" | "jacket" | "hoodie" | "graphic" | "earbuds";

export interface Idea {
  readonly id: IdeaId;
  /** The booth's buy scenario for the same item: what a card runs when the booth cannot take a typed ask (the offline mock). */
  readonly scenario: TryScenario;
  /** The words sent to Wally: the request that scenario's button uses, which the on-device recordings and the live planner both know. */
  readonly ask: string;
  readonly icon: IconName;
  readonly title: LabelPair;
  /** What the item is, when no category the person chose is why it is here. */
  readonly kind: LabelPair;
}

/** The shelf, in the order the everyday picks come: the first four are what a stranger sees. */
export const IDEAS: readonly Idea[] = [
  { id: "tee", scenario: "normal", ask: "a cotton tee", icon: "tag", title: OB.ideas.item.tee, kind: OB.ideas.kind.tee },
  { id: "socks", scenario: "small", ask: "ankle socks", icon: "tag", title: OB.ideas.item.socks, kind: OB.ideas.kind.socks },
  { id: "jacket", scenario: "overflow", ask: "a denim jacket", icon: "tag", title: OB.ideas.item.jacket, kind: OB.ideas.kind.jacket },
  { id: "hoodie", scenario: "flagged", ask: "a fleece hoodie", icon: "tag", title: OB.ideas.item.hoodie, kind: OB.ideas.kind.hoodie },
  { id: "graphic", scenario: "injected", ask: "a graphic tee", icon: "tag", title: OB.ideas.item.graphic, kind: OB.ideas.kind.graphic },
  { id: "earbuds", scenario: "off_category", ask: "wireless earbuds", icon: "tag", title: OB.ideas.item.earbuds, kind: OB.ideas.kind.earbuds },
];

export const IDEAS_SHOWN = 4;

/** Why an idea is on the list: the category the person chose that it belongs to; null for a plain pick. */
export type IdeaReason = ShopId | null;

export interface ShownIdea {
  readonly idea: Idea;
  readonly reason: IdeaReason;
}

function reasonOf(idea: Idea, profile: Profile | null): IdeaReason {
  if (profile === null) return null;
  return profile.shopFor.find((s) => SHOP_PICKS[s]?.includes(idea.scenario)) ?? null;
}

export function ideasFor(profile: Profile | null): readonly ShownIdea[] {
  const scores = profile === null ? new Map<string, number>() : fitScores(profile);
  // Array.prototype.sort is stable: ideas that fit equally keep the shelf order above.
  const ranked = [...IDEAS].sort((a, b) => (scores.get(b.scenario) ?? 0) - (scores.get(a.scenario) ?? 0));
  return ranked.slice(0, IDEAS_SHOWN).map((idea) => ({ idea, reason: reasonOf(idea, profile) }));
}
