// The SIMULATED merchant lock (audit S-RAIL-4). The lock is not the caller's free choice: it defaults to the approved
// cart's merchant domain, and a lock for any other domain is refused, so a card can only pay the merchant the
// delegator's policy approved. The real Single Use Card has no lock [F1]; this one is asked of HKT in docs/09.
import type { Decision } from "@wally/core/generated";
import { MintError } from "@wally/core/ports";
import { RailSimError } from "./errors";

/** mandate.schema.json Domain: lowercase host name, no scheme or path. */
const DOMAIN_PATTERN = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/** The lock a mint asks for: the request's, checked for shape (INVALID_REQUEST), or by default the approved merchant. */
export function requestedLock(decision: Decision, requested: unknown): string {
  if (requested === undefined) return decision.cart.merchant.domain;
  if (typeof requested !== "string" || !DOMAIN_PATTERN.test(requested)) {
    throw new RailSimError("INVALID_REQUEST", "merchantLock must be a lowercase host name");
  }
  return requested;
}

/** A new card may only be locked to the merchant of the approved cart (NOT_APPROVED otherwise). */
export function assertLockBound(lock: string, decision: Decision): void {
  if (lock !== decision.cart.merchant.domain) {
    throw new MintError("NOT_APPROVED", `SIMULATED rail: merchant lock ${lock} is not the approved merchant ${decision.cart.merchant.domain}`);
  }
}
