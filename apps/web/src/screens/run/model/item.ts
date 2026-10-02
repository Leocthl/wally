// What was bought, for display: the first item's title and the shop. Fixture titles carry a "(SIMULATED)" suffix;
// the screen shows a SIMULATED chip beside the item instead, so the title reads like a real product name.
import type { Cart } from "../../../api/types";

const SIM_SUFFIX = /\s*\(SIMULATED\)\s*$/i;

export function plainName(text: string): string {
  const stripped = text.replace(SIM_SUFFIX, "").trim();
  return stripped.length > 0 ? stripped : text;
}

/** The first item's name; the cart total (shown beside it) already covers any other lines. */
export function itemTitle(cart: Cart): string {
  return plainName(cart.items[0].title);
}

export function shopName(cart: Cart): string {
  return plainName(cart.merchant.name);
}
