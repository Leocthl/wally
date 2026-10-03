// Seals a scenario's mandate the way the delegator would: an AgentDelegationCredential signed with eddsa-jcs-2022 (ADR-0007).
// The proof is then verified, and that result is what R1 receives, so R1 runs on a real signature in every scenario.
import type { MandateCredential } from "@wally/core/generated";
import type { Signer } from "@wally/core/ports";
import { credentialIdForMandate, signMandateCredential, verifyMandateCredential, type UnsignedMandateCredential } from "@wally/core/vc";
import { loadFixture } from "@wally/core/testing/fixtures";
import type { Scenario } from "../types";

// The two contexts the credential schema requires, read from the example credential fixture so this file names neither.
const CREDENTIAL_CONTEXT = loadFixture("mandate/m0.credential.json", "mandate-credential")["@context"];

export interface Sealed {
  readonly credential: MandateCredential;
  /** DecideContext.mandateProofValid: the proof verified against the mandate's delegator. */
  readonly proofValid: boolean;
}

export function sealMandate(scenario: Scenario, delegator: Signer): Sealed {
  const { mandate } = scenario;
  const unsigned: UnsignedMandateCredential = {
    "@context": CREDENTIAL_CONTEXT,
    type: ["VerifiableCredential", "AgentDelegationCredential"],
    id: credentialIdForMandate(mandate.id),
    issuer: mandate.delegator,
    validFrom: mandate.valid_from,
    validUntil: mandate.valid_until,
    credentialSubject: { id: mandate.agent, intent_text: mandate.intent_text, rules: mandate.rules },
  };
  const credential = signMandateCredential(unsigned, delegator, { created: new Date(mandate.valid_from) });
  return { credential, proofValid: verifyMandateCredential(credential, { expectedIssuer: mandate.delegator }).valid };
}
