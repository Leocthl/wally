// verifyChain step 7 (PAYLOAD_SIGNATURE): delegator material and mandate bindings. The seq 0 credential
// must verify against the pinned delegator and root a log named after its mandate (no replay into another
// log); later payloads must name the sealed mandate; revocations and escalation answers must be the
// delegator's, and an answer must be bound (laisee.resolve.v2) to an earlier ESCALATE decision of this log,
// to this mandate and to that decision's cart.
import type { Cart, Decision, LogEntry, MandateCredential } from "../generated";
import { verifyEscalationAnswer, verifyRevocation } from "../log/delegator";
import { logIdForMandate } from "../log/ids";
import { mandateIdFromCredentialId } from "../vc/mandate";
import { verifyMandateCredential } from "../vc/proof";
import { termsOf, type SealedTerms } from "./terms";

export interface Sealed {
  readonly logId: string;
  readonly mandateId: string;
  readonly delegator: string;
  /** Budget, validity and per-purchase terms from the signed credential, for the semantics pass. */
  readonly terms: SealedTerms;
  /** ESCALATE decisions seen so far: id -> the escalated cart an answer must be bound to. */
  readonly escalations: ReadonlyMap<string, Cart>;
}

export type Delegated = { readonly ok: true; readonly sealed: Sealed } | { readonly ok: false; readonly detail: string };

const bad = (detail: string): Delegated => ({ ok: false, detail });

export function checkSeal(entry: LogEntry, expectedDelegator: string): Delegated {
  const vc = entry.payload as MandateCredential;
  const check = verifyMandateCredential(vc, { expectedIssuer: expectedDelegator });
  if (!check.valid) return bad(`mandate credential ${check.reason}: ${check.detail}`);
  const mandateId = mandateIdFromCredentialId(vc.id);
  if (logIdForMandate(mandateId) !== entry.log_id) {
    return bad(`credential for ${mandateId} cannot root ${entry.log_id} (replayed into another log)`);
  }
  return { ok: true, sealed: { logId: entry.log_id, mandateId, delegator: vc.issuer, terms: termsOf(vc), escalations: new Map() } };
}

function checkAnswer(decision: Decision, sealed: Sealed): string | null {
  const answer = decision.escalation?.answer;
  if (answer === undefined) return null;
  if (decision.resolves !== answer.decision_id) return "escalation answer is not for the decision this one resolves";
  const cart = sealed.escalations.get(answer.decision_id);
  if (cart === undefined) return "escalation answer resolves no earlier ESCALATE in this log";
  const check = verifyEscalationAnswer(answer, sealed.delegator, { decision_id: answer.decision_id, mandate_id: sealed.mandateId, cart });
  return check.valid ? null : `escalation answer ${check.reason}: ${check.detail}`;
}

function checkDecision(decision: Decision, sealed: Sealed): Delegated {
  const problem = checkAnswer(decision, sealed);
  if (problem !== null) return bad(problem);
  if (decision.outcome !== "ESCALATE") return { ok: true, sealed };
  return { ok: true, sealed: { ...sealed, escalations: new Map([...sealed.escalations, [decision.id, decision.cart]]) } };
}

/** Step 7 for seq > 0. */
export function checkDelegated(entry: LogEntry, sealed: Sealed): Delegated {
  if (entry.kind === "CARD_EVENT") return { ok: true, sealed };
  if (entry.kind === "MANDATE_SEALED") return bad("MANDATE_SEALED after seq 0");
  if (entry.payload.mandate_id !== sealed.mandateId) {
    return bad(`${entry.kind} names ${entry.payload.mandate_id}, not the sealed ${sealed.mandateId}`);
  }
  if (entry.kind === "MANDATE_REVOKED") {
    const check = verifyRevocation(entry.payload, sealed.delegator);
    return check.valid ? { ok: true, sealed } : bad(`revocation ${check.reason}: ${check.detail}`);
  }
  return entry.kind === "DECISION" ? checkDecision(entry.payload, sealed) : { ok: true, sealed };
}
