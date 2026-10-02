import type { Mandate, MandateCredential } from "../generated";

/** VC 2.0 needs a URL as the credential id; the domain Mandate keeps the bare mnd_ id. */
export const MANDATE_URN_PREFIX = "urn:laisee:mandate:";
/** Same pattern as mandate.schema.json $defs/MandateId. */
const MANDATE_ID_RE = /^mnd_[A-Za-z0-9]{6,40}$/;

export class CredentialIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialIdError";
  }
}

/** mnd_X -> urn:laisee:mandate:mnd_X. */
export function credentialIdForMandate(mandateId: string): string {
  if (!MANDATE_ID_RE.test(mandateId)) throw new CredentialIdError(`not a mandate id: ${mandateId}`);
  return MANDATE_URN_PREFIX + mandateId;
}

/** urn:laisee:mandate:mnd_X -> mnd_X. Throws on anything else (fail closed). */
export function mandateIdFromCredentialId(credentialId: string): string {
  const mandateId = credentialId.startsWith(MANDATE_URN_PREFIX) ? credentialId.slice(MANDATE_URN_PREFIX.length) : "";
  if (!MANDATE_ID_RE.test(mandateId)) throw new CredentialIdError(`not a mandate credential id: ${credentialId}`);
  return mandateId;
}

/**
 * Domain view the engine reads (mandate.schema.json) from the signed AgentDelegationCredential.
 * Pure mapping: it does not verify the proof (R1 does). Returns a new object; optional parent only when present.
 */
export function mandateFromCredential(vc: MandateCredential): Mandate {
  const { credentialSubject: subject } = vc;
  const base: Mandate = {
    id: mandateIdFromCredentialId(vc.id),
    delegator: vc.issuer,
    agent: subject.id,
    intent_text: subject.intent_text,
    rules: subject.rules,
    valid_from: vc.validFrom,
    valid_until: vc.validUntil,
  };
  return subject.parent === undefined ? base : { ...base, parent: subject.parent };
}
