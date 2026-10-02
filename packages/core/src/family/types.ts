// Family budget types (a parent funds a child, the child funds the agent: parent -> child -> agent). Caps compose:
// the child's rules are never looser than the parent's. Browser-safe.
import type { Mandate } from "../generated";

/**
 * The rule that was widened, as a path under the mandate's rules. `valid_from` and `valid_until` are mandate-level
 * (the credential's validFrom and validUntil).
 */
export type FamilyField =
  | "valid_from"
  | "valid_until"
  | "budget"
  | "categories"
  | "merchants"
  | "seller_check.require_capture"
  | "seller_check.max_capture_age_s"
  | "per_purchase.hard_cap_minor"
  | "per_purchase.ask_above_minor"
  | "per_purchase.share_of_remaining_bp"
  | "velocity";

/** Money fields hold integer minor units; lists and phrases describe the other rules. */
export type FamilyValue = number | string | boolean | readonly string[];

/** The child asks for more than the parent allows. `requested` is the child's value, `allowed` the most the parent permits. */
export interface FamilyViolation {
  readonly ok: false;
  readonly field: FamilyField;
  readonly requested: FamilyValue;
  readonly allowed: FamilyValue;
  /** A plain sentence built from a template and the two values, never from model text. */
  readonly message: string;
}

export type FamilyCheck = { readonly ok: true } | FamilyViolation;

export interface CheckChildInput {
  /** The parent's mandate view (mandateFromCredential of a verified parent credential). */
  readonly parent: Mandate;
  readonly child: Mandate;
  /** Integer minor units the parent has already allocated to other sealed children. */
  readonly allocatedMinor: number;
  readonly now: Date;
}

/** What a sealed child leaves of the parent's budget. All money in integer minor units. */
export interface ParentSummary {
  readonly mandateId: string;
  /** The parent's did:key (the credential issuer). */
  readonly issuer: string;
  readonly ceilingMinor: number;
  /** Reserved for sealed children, this one included once it is sealed. */
  readonly allocatedMinor: number;
  readonly remainingMinor: number;
  readonly validUntil: string;
  readonly categories: readonly string[];
  readonly verifiedSellersOnly: boolean;
}
