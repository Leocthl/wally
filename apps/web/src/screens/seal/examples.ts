// Example budgets for the Seal screen. The chip shows a short label (ui.ts seal.ex.*); a tap fills the sentence in the
// visitor's language and the rows from the English sentence, which the deterministic compile reads. Amounts here are
// the demo storyline's SIMULATED figures (HK$800 is F20); the others are examples a visitor can change.
import { M0_SENTENCE } from "../../booth/compile";
import { label, type LabelPair } from "../../i18n/label";

export type ExampleId = "clothes" | "shoes" | "groceries";

export interface SealExample {
  readonly id: ExampleId;
  readonly sentence: LabelPair;
}

export const EXAMPLES: readonly SealExample[] = [
  { id: "clothes", sentence: label(M0_SENTENCE, "今個月 HK$800 買衫，只限認證賣家") }, // NEEDS-REVIEW
  { id: "shoes", sentence: label("HK$500 for shoes over the next 14 days, verified sellers only; ask me above HK$300", "未來 14 日用 HK$500 買鞋，只限認證賣家；超過 HK$300 要問我") }, // NEEDS-REVIEW
  { id: "groceries", sentence: label("HK$300 for groceries this month, any seller", "今個月用 HK$300 買雜貨，任何賣家都得") }, // NEEDS-REVIEW
];

const SLUG_OF: Readonly<Record<ExampleId, string>> = { clothes: "apparel", shoes: "footwear", groceries: "groceries" };

/** The examples with the ones that fit what the person shops for first; the others keep their order. Same examples, only the order. */
export function examplesFor(shopFor: readonly string[]): readonly SealExample[] {
  const fits = (e: SealExample): boolean => shopFor.includes(SLUG_OF[e.id]);
  return [...EXAMPLES.filter(fits), ...EXAMPLES.filter((e) => !fits(e))];
}
