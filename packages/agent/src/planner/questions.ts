// The three typed questions the planner asks Laya. Semantic labels (never yes/no/true/false), and the state
// is the shopper request only: on the running server a request-only state separated clear from vague
// requests far better than a state that also listed the items (2026-10-02 probes). Item and variant text
// goes into the option descriptions. No listing text is ever used here.
import type { ChoiceSpec } from "./laya-client";
import type { ItemFamily, PlannerCandidate } from "./candidates";
import { slugify, uniqueLabels } from "./candidates";

export const NONE_LABEL = "none_of_these";
export const ITEM_CHOICE = "item_choice";
export const VARIANT_CHOICE = "variant_choice";
export const NEXT_ACTION = "next_action";

export type PlannerAction = "propose" | "replan_cheaper" | "ask_shopper" | "give_up";

export interface Option<T> {
  readonly label: string;
  readonly value: T;
}

export interface Question<T> {
  readonly spec: ChoiceSpec;
  readonly options: readonly Option<T>[];
}

const WORD = /[a-z0-9]+/g;
const STOP = new Set(["a", "an", "the", "of", "and", "for", "in", "to", "me", "my", "i", "want", "buy", "get", "some", "please", "one"]);

function words(text: string): readonly string[] {
  return (text.toLowerCase().match(WORD) ?? []).filter((w) => !STOP.has(w)).map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

/** Keeps at most `limit` families, preferring those that share words with the request; ties keep their order. */
export function pruneFamilies(request: string, families: readonly ItemFamily[], limit: number): readonly ItemFamily[] {
  if (families.length <= limit) return families;
  const wanted = new Set(words(request));
  const scored = families.map((family, index) => ({
    family,
    index,
    score: new Set(words(family.baseName).filter((w) => wanted.has(w))).size,
  }));
  const kept = scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit);
  return kept.sort((a, b) => a.index - b.index).map((k) => k.family);
}

/**
 * Items only, no none option: the evidence gate already established that the request names each of them,
 * and on the running server a none option made the top-two margin depend on how many items were listed.
 * `substitute` is the wording after a budget stop, when the request names none of the cheaper items.
 */
export function itemQuestion(request: string, families: readonly ItemFamily[], substitute: boolean): Question<ItemFamily> {
  const labels = uniqueLabels(families.map((f) => slugify(f.baseName)));
  const options = families.map((value, i) => ({ label: labels[i] ?? slugify(value.baseName), value }));
  return {
    options,
    spec: {
      id: ITEM_CHOICE,
      instructions: substitute
        ? "Which listed item is the closest substitute for what the shopper asked for?"
        : "Which item is the shopper asking for?",
      criteria: Object.fromEntries(options.map((o) => [o.label, o.value.baseName])),
      state: { request },
    },
  };
}

function variantText(v: PlannerCandidate): string {
  const parts = [v.colour, v.size === null ? null : `size ${v.size.toUpperCase()}`].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(", ") : v.baseName;
}

/** Semantic label of a variant: its colour and size, or its title when it has neither. */
export function variantLabel(v: PlannerCandidate): string {
  return slugify(v.colour === null && v.size === null ? v.title : [v.colour, v.size].filter(Boolean).join(" "));
}

export function variantQuestion(request: string, variants: readonly PlannerCandidate[]): Question<PlannerCandidate> {
  const labels = uniqueLabels(variants.map(variantLabel), [NONE_LABEL]);
  const options = variants.map((value, i) => ({ label: labels[i] ?? slugify(value.title), value }));
  return {
    options,
    spec: {
      id: VARIANT_CHOICE,
      instructions: "Which variant does the shopper want?",
      criteria: {
        ...Object.fromEntries(options.map((o) => [o.label, variantText(o.value)])),
        [NONE_LABEL]: "the request does not say which variant, or none of these",
      },
      state: { request },
    },
  };
}

/**
 * Legal actions only, `propose` first so a tie keeps the default. `replan_cheaper` is executed by code on a
 * budget stop and is never offered here: on the running server Laya could not compare a price with a budget.
 */
export function actionQuestion(request: string, chosenTitle: string, variantNote: string): ChoiceSpec {
  return {
    id: NEXT_ACTION,
    instructions: "What should the shopping assistant do next?",
    criteria: {
      propose: "buy the chosen item: it matches the request",
      ask_shopper: "the request is unclear or a size or colour is missing, so ask the shopper",
      give_up: "no listed item can satisfy the request, so stop",
    },
    state: { request, chosen_item: chosenTitle, variant: variantNote },
  };
}
