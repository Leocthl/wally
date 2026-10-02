import type { Mandate, MandateCredential } from "../generated";

/**
 * Domain view the engine reads (mandate.schema.json) from the signed AgentDelegationCredential.
 * Pure mapping: it does not verify the proof (R1 does). Returns a new object; optional parent only when present.
 */
export function mandateFromCredential(vc: MandateCredential): Mandate {
  const { credentialSubject: subject } = vc;
  const base: Mandate = {
    id: vc.id,
    delegator: vc.issuer,
    agent: subject.id,
    intent_text: subject.intent_text,
    rules: subject.rules,
    valid_from: vc.validFrom,
    valid_until: vc.validUntil,
  };
  return subject.parent === undefined ? base : { ...base, parent: subject.parent };
}
