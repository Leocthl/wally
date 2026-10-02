// Audit (lane s-audit): domain separation between the four Ed25519 messages, strict encodings of
// delegator signatures, and the small-order "universal signature" that only strict verification stops.
// All confirmed non-defects: regression tests.
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { describe, expect, it } from "vitest";
import { concat, didKeyFromPublicKey, parseDidKey } from "../src/crypto";
import {
  delegatorSigningMessage,
  logSigningMessage,
  RESOLVE_DOMAIN,
  REVOKE_DOMAIN,
  signEscalationAnswer,
  signRevocation,
  verifyEscalationAnswer,
  verifyRevocation,
} from "../src/log";
import { signMandateCredential, verifyMandateCredential, type UnsignedMandateCredential } from "../src/vc";
import { demoCredential, demoKeys } from "./log-helpers";

const keys = demoKeys();
const HASH = "ab".repeat(32);

describe("domain separation of signed messages", () => {
  it("log, revoke and resolve messages differ in prefix and length from each other and from 64-byte credential hashData", () => {
    const messages = [
      logSigningMessage(HASH),
      delegatorSigningMessage(REVOKE_DOMAIN, { x: 1 }),
      delegatorSigningMessage(RESOLVE_DOMAIN, { x: 1 }),
    ];
    const lengths = messages.map((m) => m.length);
    expect(new Set(lengths).size).toBe(3);
    expect(lengths).not.toContain(64);
    const text = messages.map((m) => new TextDecoder().decode(m));
    expect(text.map((t) => t.slice(0, t.indexOf(":")))).toEqual(["laisee.log.v1", "laisee.revoke.v1", "laisee.resolve.v1"]);
  });

  it("a delegator revocation signature does not verify as an escalation answer, even with the same key", () => {
    const revocation = signRevocation({ mandate_id: "mnd_demoM0", revoked_at: new Date("2026-10-03T02:30:00Z") }, keys.delegator);
    const answer = signEscalationAnswer({ decision_id: "dec_demoE1", choice: "APPROVE", answered_at: new Date("2026-10-03T02:20:30Z") }, keys.delegator);
    expect(verifyRevocation(revocation, keys.delegator.did).valid).toBe(true);
    expect(verifyEscalationAnswer({ ...answer, signature: revocation.signature }, keys.delegator.did)).toMatchObject({ valid: false, reason: "SIGNATURE" });
  });

  it("an answer signed by the engine key (a different role) is SIGNER, never accepted", () => {
    const answer = signEscalationAnswer({ decision_id: "dec_demoE1", choice: "APPROVE", answered_at: new Date("2026-10-03T02:20:30Z") }, keys.engine);
    expect(verifyEscalationAnswer(answer, keys.delegator.did)).toMatchObject({ valid: false, reason: "SIGNER" });
  });
});

describe("strict encodings of delegator signatures", () => {
  const answer = signEscalationAnswer({ decision_id: "dec_demoE1", choice: "APPROVE", answered_at: new Date("2026-10-03T02:20:30Z") }, keys.delegator);
  const bytes = Buffer.from(answer.signature, "base64url");

  it.each([
    ["padded", `${answer.signature}==`],
    ["standard alphabet", bytes.toString("base64").replace(/=+$/, "")],
    ["spare bits set", answer.signature.slice(0, -1) + (answer.signature.endsWith("A") ? "B" : "A")],
  ])("rejects a %s signature spelling", (_name, signature) => {
    if (signature === answer.signature) return; // the standard alphabet can coincide with base64url
    expect(verifyEscalationAnswer({ ...answer, signature }, keys.delegator.did).valid).toBe(false);
  });
});

describe("small-order issuer key (identity point)", () => {
  const identity = Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? 1 : 0));
  const did = didKeyFromPublicKey(identity);

  it("parses as a did:key (on-curve, canonical) but no signature ever verifies under it", () => {
    expect(parseDidKey(did)).not.toBeNull();
    const { proof: _proof, ...genuine } = demoCredential(keys);
    const unsigned: UnsignedMandateCredential = { ...genuine, issuer: did };
    // A real signer cannot have this key; forge the 'universal' signature R = identity, S = 0 instead.
    const template = signMandateCredential({ ...unsigned, issuer: keys.delegator.did }, keys.delegator, { created: new Date("2026-10-03T02:00:00Z") });
    const universal = `z${base58.encode(concat(identity, new Uint8Array(32)))}`;
    const forged = { ...unsigned, proof: { ...template.proof, verificationMethod: `${did}#${did.slice(8)}`, proofValue: universal } };
    expect(ed25519.verify(concat(identity, new Uint8Array(32)), new Uint8Array(64), identity, { zip215: true })).toBe(true);
    expect(verifyMandateCredential(forged, { expectedIssuer: did })).toMatchObject({ valid: false, reason: "SIGNATURE" });
  });
});
