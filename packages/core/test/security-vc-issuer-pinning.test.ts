// Audit (lane s-audit): issuer pinning for the AgentDelegationCredential. A did:key credential is
// self-certifying: without a trusted issuer, verifyMandateCredential checks the proof against the key the
// credential names itself. R1 only reads the caller's boolean (DecideContext.mandateProofValid), so the
// orchestrator's call is the whole trust decision.
import { describe, expect, it } from "vitest";
import { createSigner } from "../src/crypto";
import { verifyChain } from "../src/verify";
import { signMandateCredential, verifyMandateCredential, type UnsignedMandateCredential } from "../src/vc";
import { testSeed } from "./crypto-independent";
import { buildLog, demoCredential, demoKeys } from "./log-helpers";

const keys = demoKeys();
const mallory = createSigner(testSeed("mallory-self-issuer"));

/** Mallory issues herself a mandate for the real agent with a HK$999,999.99 packet. */
function selfIssued() {
  const { proof: _proof, ...genuine } = demoCredential(keys);
  const rules = { ...genuine.credentialSubject.rules, budget: { amount_minor: 99_999_999, currency: "HKD" as const } };
  const unsigned: UnsignedMandateCredential = { ...genuine, issuer: mallory.did, credentialSubject: { ...genuine.credentialSubject, rules } };
  return signMandateCredential(unsigned, mallory, { created: new Date("2026-10-03T02:00:00Z") });
}

const SELF_ISSUED = selfIssued();
const UNPINNED = verifyMandateCredential(SELF_ISSUED);
const PINNED = verifyMandateCredential(SELF_ISSUED, { expectedIssuer: keys.delegator.did });

describe("issuer pinning (controls)", () => {
  it("pinned to the delegator, a self-issued credential is WRONG_ISSUER", () => {
    expect(PINNED).toMatchObject({ valid: false, reason: "WRONG_ISSUER" });
  });

  it("the offline verifier pins the delegator from the public keys file (checkSeal)", async () => {
    const log = await buildLog([{ kind: "MANDATE_SEALED", payload: SELF_ISSUED }], keys);
    expect(verifyChain(log.entries, keys.publicKeys)).toMatchObject({ ok: false, failedSeq: 0, reason: "PAYLOAD_SIGNATURE" });
  });
});

describe("KNOWN DEFECT S-VC-1: verifyMandateCredential fails open when no trusted issuer is given", () => {
  it("setup: Mallory's credential is well formed and carries a HK$999,999.99 packet", () => {
    expect(verifyMandateCredential(SELF_ISSUED, { expectedIssuer: mallory.did }).valid).toBe(true);
    expect(SELF_ISSUED.credentialSubject.rules.budget.amount_minor).toBe(99_999_999);
  });

  it.fails("without expectedIssuer the check must fail closed (I5), not trust the credential's own key", () => {
    expect(UNPINNED.valid).toBe(false);
  });
});
