// Family seal (parent -> child -> agent). A credential that names a parent is sealed only when the parent credential
// verifies against the pinned parent key, the link names exactly that credential, the parent funds this delegator, and the
// child's rules are within the parent's after what other children already took. A refusal logs nothing. The budget is
// reserved in the ledger before any await, so two seals cannot both pass on the same remaining room; it is released
// when the seal fails afterwards. The parent credential is checked here and is not part of the child's log.
import { checkChildWithinParent, parentLinkOf, sameLink, summarizeParent, type ParentSummary } from "../family";
import type { Mandate, MandateCredential } from "../generated";
import { mandateFromCredential } from "../vc/mandate";
import { verifyMandateCredential } from "../vc/proof";
import { StepError, describe, now, type Ctx } from "./context";

export interface ParentAcceptance {
  /** What the parent has left, this child included. */
  readonly summary: ParentSummary;
  /** Gives the reservation back (the seal failed after the check). */
  release(): void;
}

const refuse = (message: string): StepError => new StepError("INVALID_CREDENTIAL", message);

/** A private copy of the offered parent credential, verified against the pinned parent key. */
function verifiedParent(pinned: string, offered: unknown): MandateCredential {
  let copy: unknown;
  try {
    copy = structuredClone(offered);
  } catch (err) {
    throw refuse(`parent credential is not plain data: ${describe(err)}`);
  }
  const check = verifyMandateCredential(copy, { expectedIssuer: pinned });
  if (!check.valid) throw refuse(`parent credential refused (${check.reason}): ${check.detail}`);
  return copy as MandateCredential;
}

function requireLinked(child: MandateCredential, parent: MandateCredential): void {
  const link = child.credentialSubject.parent;
  if (link === undefined || !sameLink(link, parentLinkOf(parent))) throw refuse("the parent link does not match the parent credential");
  if (parent.credentialSubject.parent !== undefined) throw refuse("the parent credential has a parent of its own: only one level is allowed");
  if (parent.credentialSubject.id !== child.issuer) throw refuse("the parent credential was not issued to this delegator");
}

function requireWithin(ctx: Ctx, parent: Mandate, child: Mandate): void {
  const found = checkChildWithinParent({ parent, child, allocatedMinor: ctx.allocations.allocated(parent.id, child.id), now: now(ctx) });
  if (found.ok) return;
  throw new StepError("EXCEEDS_PARENT", found.message, { details: { field: found.field, requested: found.requested, allowed: found.allowed } });
}

/**
 * Null for a credential with no parent. Otherwise runs every check, reserves the child's budget and returns the summary;
 * throws StepError (INVALID_CREDENTIAL or EXCEEDS_PARENT) with nothing reserved.
 */
export function acceptParent(ctx: Ctx, vc: MandateCredential, mandate: Mandate, offered: unknown): ParentAcceptance | null {
  if (vc.credentialSubject.parent === undefined) {
    if (offered !== undefined) throw refuse("a parent credential was given, but the credential names no parent");
    return null;
  }
  const pinned = ctx.deps.parentDid;
  if (pinned === undefined) throw refuse("no parent is pinned here, so a budget that names a parent is refused");
  if (offered === undefined) throw refuse("the credential names a parent, but no parent credential was given");
  const parentVc = verifiedParent(pinned, offered);
  requireLinked(vc, parentVc);
  const parent = mandateFromCredential(parentVc);
  requireWithin(ctx, parent, mandate);
  ctx.allocations.reserve(parent.id, mandate.id, mandate.rules.budget.amount_minor);
  return {
    summary: summarizeParent(parent, ctx.allocations.allocated(parent.id)),
    release: () => void ctx.allocations.release(parent.id, mandate.id),
  };
}
