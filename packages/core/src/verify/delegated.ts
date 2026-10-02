// verifyChain step 7 (PAYLOAD_SIGNATURE): delegator material and mandate bindings. The seq 0 credential
// must verify against the expected delegator and root a log named after its mandate (no replay into
// another log); later payloads must name the sealed mandate; revocations and escalation answers must be
// the delegator's, and an answer must resolve an earlier ESCALATE decision of this log.
import type { Decision, LogEntry, MandateCredential } from "../generated";
import { verifyEscalationAnswer, verifyRevocation } from "../log/delegator";
import { logIdForMandate } from "../log/ids";
import { mandateIdFromCredentialId } from "../vc/mandate";
import { verifyMandateCredential } from "../vc/proof";

export interface Sealed {
  readonly logId: string;
  readonly mandateId: string;
  readonly delegator: string;
  /** ids of ESCALATE decisions seen so far. */
  readonly escalations: ReadonlySet<string>;
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
  return { ok: true, sealed: { logId: entry.log_id, mandateId, delegator: vc.issuer, escalations: new Set() } };
}

function checkDecision(decision: Decision, sealed: Sealed): Delegated {
  const answer = decision.escalation?.answer;
  if (answer !== undefined) {
    const check = verifyEscalationAnswer(answer, sealed.delegator);
    if (!check.valid) return bad(`escalation answer ${check.reason}: ${check.detail}`);
    if (decision.resolves !== answer.decision_id) return bad("escalation answer is not for the decision this one resolves");
    if (!sealed.escalations.has(answer.decision_id)) return bad("escalation answer resolves no earlier ESCALATE in this log");
  }
  if (decision.outcome !== "ESCALATE") return { ok: true, sealed };
  return { ok: true, sealed: { ...sealed, escalations: new Set([...sealed.escalations, decision.id]) } };
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
