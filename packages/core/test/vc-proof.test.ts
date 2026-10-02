// A-31: AgentDelegationCredential proof, Data Integrity eddsa-jcs-2022. Golden vector computed by the real
// code and recomputed by an independent path (noble primitives + local encoders) inside this test.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSigner, toBase58btc, verificationMethodId } from "../src/crypto";
import type { MandateCredential } from "../src/generated";
import { loadFixture } from "../src/testing/fixtures";
import { signMandateCredential, verifyMandateCredential, type UnsignedMandateCredential } from "../src/vc";
import { indepDidKey, indepProofValue, indepPublicKey, testSeed } from "./crypto-independent";

const DELEGATOR_SEED = testSeed("delegator");
const AGENT_SEED = testSeed("agent");
const OTHER_SEED = testSeed("other-delegator");
const CREATED = new Date("2026-10-03T02:00:00Z");

// Computed by signMandateCredential for the M0 fixture with the test seeds above; the first test also
// recomputes it through indepProofValue. Ed25519 is deterministic, so this never changes unless the
// credential bytes or the algorithm change.
const GOLDEN = {
  delegatorDid: "did:key:z6Mkh1Mr9LegBjW9QXNVCLt2qFWrDQLFeUU8czVryE9YyreK",
  proofValue: "z4KV9AQvb21v83w4AKXGp6W9dTWXfmg3RTZ7EWHMxdrdDauE3gfMhKeEeZPi4A1NR6g8BQ5haJ34VZjedi8E8m4gG",
};

function unsignedM0(issuerSeed = DELEGATOR_SEED): UnsignedMandateCredential {
  const { proof: _proof, ...fixture } = loadFixture("mandate/m0.credential.json", "mandate-credential");
  return {
    ...fixture,
    issuer: indepDidKey(indepPublicKey(issuerSeed)),
    credentialSubject: { ...fixture.credentialSubject, id: indepDidKey(indepPublicKey(AGENT_SEED)) },
  };
}

function signedM0(): MandateCredential {
  return signMandateCredential(unsignedM0(), createSigner(DELEGATOR_SEED), { created: CREATED });
}

describe("signMandateCredential (eddsa-jcs-2022)", () => {
  it("matches the golden vector and the independent path", () => {
    const vc = signedM0();
    expect(vc.issuer).toBe(GOLDEN.delegatorDid);
    expect(vc.proof.proofValue).toBe(GOLDEN.proofValue);
    expect(indepProofValue(vc as unknown as Record<string, unknown>, DELEGATOR_SEED)).toBe(GOLDEN.proofValue);
    expect(vc.proof).toEqual({
      type: "DataIntegrityProof",
      cryptosuite: "eddsa-jcs-2022",
      created: "2026-10-03T02:00:00.000Z",
      verificationMethod: `${vc.issuer}#${vc.issuer.slice("did:key:".length)}`,
      proofPurpose: "assertionMethod",
      proofValue: GOLDEN.proofValue,
    });
  });

  it("does not mutate or share its input and refuses to sign for another issuer", () => {
    const unsigned = Object.freeze(unsignedM0());
    const vc = signMandateCredential(unsigned, createSigner(DELEGATOR_SEED), { created: CREATED });
    expect(vc).not.toBe(unsigned);
    expect(vc.credentialSubject).not.toBe(unsigned.credentialSubject);
    expect("proof" in unsigned).toBe(false);
    expect(() => signMandateCredential(unsigned, createSigner(OTHER_SEED), { created: CREATED })).toThrow();
  });

  it("replaces a stale proof instead of signing over it", () => {
    const vc = signedM0();
    const resigned = signMandateCredential(vc as UnsignedMandateCredential, createSigner(DELEGATOR_SEED), { created: CREATED });
    expect(resigned.proof.proofValue).toBe(vc.proof.proofValue);
  });

  it("refuses to sign a credential that fails the schema", () => {
    const bad = { ...unsignedM0(), id: "mnd_demoM0" };
    expect(() => signMandateCredential(bad, createSigner(DELEGATOR_SEED), { created: CREATED })).toThrow();
  });
});

describe("verifyMandateCredential", () => {
  it("accepts the signed credential, with or without proof @context", () => {
    const vc = signedM0();
    expect(verifyMandateCredential(vc)).toEqual({ valid: true, reason: null });
    expect(verifyMandateCredential(vc, { expectedIssuer: vc.issuer }).valid).toBe(true);
    const withContext = { ...vc, proof: { ...vc.proof, "@context": vc["@context"] } };
    expect(verifyMandateCredential(withContext).valid).toBe(true);
  });

  it("fails SIGNATURE when rules, expiry or proof options change after signing", () => {
    const vc = signedM0();
    const rules = vc.credentialSubject.rules;
    const tampered: MandateCredential[] = [
      { ...vc, credentialSubject: { ...vc.credentialSubject, rules: { ...rules, budget: { ...rules.budget, amount_minor: 8000000 } } } },
      { ...vc, validUntil: "2027-10-31T15:59:59Z" },
      { ...vc, proof: { ...vc.proof, created: "2026-10-03T02:00:01.000Z" } },
      { ...vc, credentialSubject: { ...vc.credentialSubject, id: indepDidKey(indepPublicKey(OTHER_SEED)) } },
    ];
    for (const t of tampered) expect(verifyMandateCredential(t)).toMatchObject({ valid: false, reason: "SIGNATURE" });
  });

  it("fails SIGNATURE for a wrong issuer key and WRONG_ISSUER for an unexpected issuer", () => {
    const vc = signedM0();
    const otherDid = indepDidKey(indepPublicKey(OTHER_SEED));
    const swapped = { ...vc, issuer: otherDid, proof: { ...vc.proof, verificationMethod: verificationMethodId(otherDid) } };
    expect(verifyMandateCredential(swapped)).toMatchObject({ valid: false, reason: "SIGNATURE" });
    expect(verifyMandateCredential(vc, { expectedIssuer: otherDid })).toMatchObject({ valid: false, reason: "WRONG_ISSUER" });
  });

  it("fails VERIFICATION_METHOD when the method is not the issuer's key", () => {
    const vc = signedM0();
    const vm = verificationMethodId(indepDidKey(indepPublicKey(OTHER_SEED)));
    expect(verifyMandateCredential({ ...vc, proof: { ...vc.proof, verificationMethod: vm } })).toMatchObject({
      valid: false,
      reason: "VERIFICATION_METHOD",
    });
  });

  it("fails SCHEMA for a wrong cryptosuite, a missing proof, non-base58btc multibase or junk", () => {
    const vc = signedM0();
    const { proof: _proof, ...noProof } = vc;
    const cases: unknown[] = [
      { ...vc, proof: { ...vc.proof, cryptosuite: "eddsa-rdfc-2022" } },
      noProof,
      { ...vc, proof: { ...vc.proof, proofValue: `u${vc.proof.proofValue.slice(1)}` } },
      null,
      "credential",
      [vc],
    ];
    for (const c of cases) expect(verifyMandateCredential(c)).toMatchObject({ valid: false, reason: "SCHEMA" });
  });

  it("fails PROOF_VALUE when the multibase value is not a 64-byte signature", () => {
    const vc = signedM0();
    const short = `z${toBase58btc(new Uint8Array(63).fill(9))}`;
    expect(short.length).toBeGreaterThanOrEqual(81);
    expect(verifyMandateCredential({ ...vc, proof: { ...vc.proof, proofValue: short } })).toMatchObject({
      valid: false,
      reason: "PROOF_VALUE",
    });
  });

  it("fails ISSUER_KEY for a placeholder did:key that is not a real Ed25519 key", () => {
    const fixture = loadFixture("mandate/m0.credential.json", "mandate-credential");
    expect(verifyMandateCredential(fixture)).toMatchObject({ valid: false, reason: "ISSUER_KEY" });
  });

  it("round-trips any intent text and budget (property)", () => {
    const signer = createSigner(DELEGATOR_SEED);
    fc.assert(
      fc.property(
        fc.string({ unit: "grapheme", minLength: 1, maxLength: 60 }),
        fc.integer({ min: 0, max: 200000 }),
        (intent, amount) => {
          const base = unsignedM0();
          const rules = { ...base.credentialSubject.rules, budget: { amount_minor: amount, currency: "HKD" as const } };
          const unsigned = { ...base, credentialSubject: { ...base.credentialSubject, intent_text: intent, rules } };
          const vc = signMandateCredential(unsigned, signer, { created: CREATED });
          const bumped = { ...rules, budget: { amount_minor: amount + 1, currency: "HKD" as const } };
          const tampered = { ...vc, credentialSubject: { ...vc.credentialSubject, rules: bumped } };
          return verifyMandateCredential(vc).valid && !verifyMandateCredential(tampered).valid;
        },
      ),
      { numRuns: 40 },
    );
  });
});
