// What the sealed credential lets an APPROVE or a mint do, read from the delegator-signed credential alone, so
// the operator cannot restate it: the validity window (R2: validFrom <= time < validUntil, the comparison the
// engine makes) and the per-purchase terms (R4: hard cap, share of what remains, ask above). Browser-safe.
import type { MandateCredential } from "../generated";

/** Basis points per whole (unit of share_of_remaining_bp, mandate.schema.json). */
const BP_PER_WHOLE = 10_000n;

export interface SealedTerms {
  readonly budgetMinor: number;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly hardCapMinor: number | null;
  readonly shareOfRemainingBp: number | null;
  readonly askAboveMinor: number | null;
}

export function termsOf(vc: MandateCredential): SealedTerms {
  const rules = vc.credentialSubject.rules;
  const perPurchase = rules.per_purchase;
  return {
    budgetMinor: rules.budget.amount_minor,
    validFrom: vc.validFrom,
    validUntil: vc.validUntil,
    hardCapMinor: perPurchase?.hard_cap_minor ?? null,
    shareOfRemainingBp: perPurchase?.share_of_remaining_bp ?? null,
    askAboveMinor: perPurchase?.ask_above_minor ?? null,
  };
}

/** Why `at` falls outside the mandate's validity [validFrom, validUntil), or null. Unreadable times fail closed. */
export function outsideValidity(at: string, terms: SealedTerms): string | null {
  const time = Date.parse(at);
  const inside = time >= Date.parse(terms.validFrom) && time < Date.parse(terms.validUntil);
  return inside ? null : `${at} is outside the mandate's validity (${terms.validFrom} to ${terms.validUntil})`;
}

/** R4 caps no answer can lift: the hard cap, and the share of what remains as this log accounts it. */
export function capProblem(totalMinor: number, remainingMinor: number, terms: SealedTerms): string | null {
  if (terms.hardCapMinor !== null && totalMinor > terms.hardCapMinor) return `total ${totalMinor} is over the per-purchase cap ${terms.hardCapMinor}`;
  if (terms.shareOfRemainingBp === null) return null;
  const share = Number((BigInt(Math.max(0, remainingMinor)) * BigInt(terms.shareOfRemainingBp)) / BP_PER_WHOLE);
  return totalMinor > share ? `total ${totalMinor} is over ${terms.shareOfRemainingBp} bp of the ${remainingMinor} left (${share})` : null;
}
