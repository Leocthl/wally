// checkChildWithinParent: is the child's mandate inside the parent's? Pure; money in integer minor units. Caps compose, so
// a child can only narrow what the parent set: budget (after what the parent already gave other children), categories,
// merchants, seller check, per-purchase terms, velocity and end date. The first widening found is reported, in this order.
import {
  checkBudget,
  checkCategories,
  checkMerchants,
  checkPerPurchase,
  checkSeller,
  checkValidity,
  checkVelocity,
} from "./terms";
import type { CheckChildInput, FamilyCheck } from "./types";

const OK: FamilyCheck = { ok: true };

export function checkChildWithinParent({ parent, child, allocatedMinor, now }: CheckChildInput): FamilyCheck {
  const checks: readonly (() => FamilyCheck | null)[] = [
    () => checkValidity(parent, child, now),
    () => checkBudget(parent, child, allocatedMinor),
    () => checkCategories(parent, child),
    () => checkMerchants(parent, child),
    () => checkSeller(parent, child),
    () => checkPerPurchase(parent, child),
    () => checkVelocity(parent, child),
  ];
  for (const check of checks) {
    const found = check();
    if (found !== null) return found;
  }
  return OK;
}
