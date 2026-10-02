// R6 merchant and category inside the mandate. Deny wins and also covers subdomains of a denied
// domain; a non-null allow list matches exact domains only (fail closed).
import type { Cart, Mandate } from "../generated";
import { failed, passed, type RuleResult } from "./result";

export interface R6Input {
  readonly mandate: Mandate;
  readonly cart: Cart;
}

const normalise = (domain: string): string => domain.trim().toLowerCase();

function isDeniedBy(domain: string, rule: string): boolean {
  const r = normalise(rule);
  return domain === r || domain.endsWith(`.${r}`);
}

function uniqueInOrder(values: readonly string[]): string[] {
  return values.filter((v, i) => values.indexOf(v) === i);
}

/** R6: DENY R6.off_mandate for a denied or non-allowed merchant, or any item category outside the list. */
export function evaluateR6({ mandate, cart }: R6Input): RuleResult {
  const { allow, deny } = mandate.rules.merchants;
  const domain = normalise(cart.merchant.domain);
  if (deny.some((d) => isDeniedBy(domain, d))) {
    const inputs = { domain, deny, reason: "merchant_denied" };
    return failed({ id: "R6", inputs, comparator: "not_in", thresholdRef: "mandate.rules.merchants.deny" }, "DENY", "R6.off_mandate");
  }
  if (allow !== null && !allow.map(normalise).includes(domain)) {
    const inputs = { domain, allow, reason: "merchant_not_allowed" };
    return failed({ id: "R6", inputs, comparator: "in", thresholdRef: "mandate.rules.merchants.allow" }, "DENY", "R6.off_mandate");
  }
  const categories = mandate.rules.categories;
  const itemCategories = uniqueInOrder(cart.items.map((i) => i.category));
  const off = itemCategories.filter((c) => !categories.includes(c));
  const spec = { id: "R6" as const, comparator: "in" as const, thresholdRef: "mandate.rules.categories" };
  if (off.length > 0) {
    const inputs = { domain, categories, item_categories: itemCategories, off_categories: off, reason: "category" };
    return failed({ ...spec, inputs }, "DENY", "R6.off_mandate");
  }
  return passed({ ...spec, inputs: { domain, allow, categories, item_categories: itemCategories } });
}
