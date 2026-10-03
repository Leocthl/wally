// Category slugs in the shopper's words, for both languages at once (a recorded decision keeps its own words in the log, so the
// plain reason has to be built in either language from what it recorded). Unknown slugs show as written.
import { label, type LabelPair } from "../../../i18n/label";
import { UI } from "../../../i18n/ui";

const KNOWN: Readonly<Record<string, LabelPair>> = {
  apparel: UI["home.cat.apparel"],
  footwear: UI["home.cat.footwear"],
  electronics: UI["home.cat.electronics"],
  groceries: UI["home.cat.groceries"],
};

export function categoryLabel(slug: string): LabelPair {
  return Object.prototype.hasOwnProperty.call(KNOWN, slug) ? (KNOWN[slug] ?? label(slug, slug)) : label(slug, slug);
}

/** "Clothes", "Clothes, Shoes": the allowed categories joined the way each language joins a list. */
export function categoriesLabel(slugs: readonly string[]): LabelPair {
  const names = slugs.map(categoryLabel);
  return label(names.map((n) => n.en).join(UI["home.listJoin"].en), names.map((n) => n.zh).join(UI["home.listJoin"].zh));
}
