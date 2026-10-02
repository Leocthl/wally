// Delegator-signed payloads: revocation (laisee.revoke.v1) and escalation answer (laisee.resolve.v1).
// Signature = base64url(Ed25519(UTF-8('<domain>:' + hex SHA-256(JCS(object without signature))))).
import { describe, expect, it } from "vitest";
import { createSigner } from "../src/crypto";
import {
  RESOLVE_DOMAIN,
  REVOKE_DOMAIN,
  signEscalationAnswer,
  signRevocation,
  verifyEscalationAnswer,
  verifyRevocation,
} from "../src/log";
import { validateEscalationAnswer, validateRevocation } from "../src/schema";
import { indepDelegatorSignature, testSeed } from "./crypto-independent";
import { DELEGATOR_SEED, MANDATE_ID } from "./log-helpers";

const delegator = createSigner(DELEGATOR_SEED);
const other = createSigner(testSeed("someone-else"));
const AT = new Date("2026-10-03T02:30:00Z");

describe("revocation (S4)", () => {
  it("is schema-valid, bound to the signer, and matches the independent path", () => {
    const rev = signRevocation({ mandate_id: MANDATE_ID, revoked_at: AT, reason: "lost phone" }, delegator);
    expect(validateRevocation(rev).ok).toBe(true);
    expect(rev.signer).toBe(delegator.did);
    const { signature, ...unsigned } = rev;
    expect(signature).toBe(indepDelegatorSignature(REVOKE_DOMAIN, unsigned, DELEGATOR_SEED));
    expect(verifyRevocation(rev, delegator.did)).toEqual({ valid: true, reason: null });
  });

  it("omits reason when absent", () => {
    const rev = signRevocation({ mandate_id: MANDATE_ID, revoked_at: AT }, delegator);
    expect("reason" in rev).toBe(false);
    expect(verifyRevocation(rev, delegator.did).valid).toBe(true);
  });

  it("fails for another delegator, a changed field, a forged signer or junk", () => {
    const rev = signRevocation({ mandate_id: MANDATE_ID, revoked_at: AT }, delegator);
    expect(verifyRevocation(rev, other.did)).toMatchObject({ valid: false, reason: "SIGNER" });
    expect(verifyRevocation({ ...rev, revoked_at: "2026-10-03T02:31:00Z" }, delegator.did)).toMatchObject({ reason: "SIGNATURE" });
    expect(verifyRevocation({ ...rev, mandate_id: "mnd_otherM1" }, delegator.did)).toMatchObject({ reason: "SIGNATURE" });
    const forged = signRevocation({ mandate_id: MANDATE_ID, revoked_at: AT }, other);
    expect(verifyRevocation({ ...forged, signer: delegator.did }, delegator.did)).toMatchObject({ reason: "SIGNATURE" });
    expect(verifyRevocation({ ...rev, signature: "x" }, delegator.did)).toMatchObject({ reason: "SCHEMA" });
    expect(verifyRevocation(null, delegator.did)).toMatchObject({ reason: "SCHEMA" });
  });
});

describe("escalation answer", () => {
  it("is schema-valid and matches the independent path", () => {
    const answer = signEscalationAnswer({ decision_id: "dec_demoE1", choice: "APPROVE", answered_at: AT }, delegator);
    expect(validateEscalationAnswer(answer).ok).toBe(true);
    const { signature, ...unsigned } = answer;
    expect(signature).toBe(indepDelegatorSignature(RESOLVE_DOMAIN, unsigned, DELEGATOR_SEED));
    expect(verifyEscalationAnswer(answer, delegator.did).valid).toBe(true);
  });

  it("binds decision_id and choice", () => {
    const answer = signEscalationAnswer({ decision_id: "dec_demoE1", choice: "DENY", answered_at: AT }, delegator);
    expect(verifyEscalationAnswer({ ...answer, choice: "APPROVE" }, delegator.did)).toMatchObject({ reason: "SIGNATURE" });
    expect(verifyEscalationAnswer({ ...answer, decision_id: "dec_demoE9" }, delegator.did)).toMatchObject({ reason: "SIGNATURE" });
  });

  it("is domain-separated: the same bytes signed as a revoke do not verify as an answer", () => {
    const answer = signEscalationAnswer({ decision_id: "dec_demoE1", choice: "APPROVE", answered_at: AT }, delegator);
    const { signature: _signature, ...unsigned } = answer;
    const crossDomain = { ...unsigned, signature: indepDelegatorSignature(REVOKE_DOMAIN, unsigned, DELEGATOR_SEED) };
    expect(verifyEscalationAnswer(crossDomain, delegator.did)).toMatchObject({ valid: false, reason: "SIGNATURE" });
  });

  it("refuses to sign an answer that fails the schema", () => {
    expect(() => signEscalationAnswer({ decision_id: "nope", choice: "APPROVE", answered_at: AT }, delegator)).toThrow();
  });
});
