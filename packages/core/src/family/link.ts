// The link from a child credential to its parent, and what the parent has left. The link pins the parent by id and by the
// SHA-256 of JCS of the full parent credential, proof included (mandate.schema.json ParentLink), so a child cannot be
// replayed under a different or edited parent. The parent credential is not part of the child's log: the offline verifier
// checks the child as it always does and cannot check this chain; the parent credential is exported next to the log.
import { jcsSha256Hex } from "../crypto/jcs";
import type { Mandate, MandateCredential, ParentLink } from "../generated";
import { mandateIdFromCredentialId } from "../vc";
import type { ParentSummary } from "./types";

export function parentLinkOf(parent: MandateCredential): ParentLink {
  return { mandate_id: mandateIdFromCredentialId(parent.id), mandate_sha256: jcsSha256Hex(parent) };
}

export function sameLink(a: ParentLink, b: ParentLink): boolean {
  return a.mandate_id === b.mandate_id && a.mandate_sha256 === b.mandate_sha256;
}

/** The parent's budget after `allocatedMinor` went to sealed children. */
export function summarizeParent(parent: Mandate, allocatedMinor: number): ParentSummary {
  const ceilingMinor = parent.rules.budget.amount_minor;
  return {
    mandateId: parent.id,
    issuer: parent.delegator,
    ceilingMinor,
    allocatedMinor,
    remainingMinor: Math.max(0, ceilingMinor - allocatedMinor),
    validUntil: parent.valid_until,
    categories: parent.rules.categories,
    verifiedSellersOnly: parent.rules.seller_check.require_capture,
  };
}
