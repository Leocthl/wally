// M-09 groundwork: an async-capable delegator signer (a WebCrypto key, a confirmation screen or a platform key would
// sign later) used with the UNCHANGED synchronous core Signer port. A dry run captures the exact bytes, the async signer
// signs them, a second run uses the signatures and checks the bytes did not change; anything odd fails closed.
import { createSigner, generateKeyPair } from "@laisee/core/crypto";
import { delegatorSigningMessage, signEscalationAnswer, signRevocation, verifyEscalationAnswer, verifyRevocation } from "@laisee/core/log";
import type { Signer } from "@laisee/core/ports";
import { signMandateCredential, verifyMandateCredential } from "@laisee/core/vc";
import { describe, expect, it, vi } from "vitest";
import { AsyncSignError, memoryAsyncSigner, signWithAsync, type AsyncSigner } from "../src/api/local/signer";
import { buildCredential } from "../src/booth/backend/session";
import { REFERENCE_CART } from "../src/api/mock/fixtures";
import { m0SealRequest } from "../src/api/mock/presets";

function freshSigner(): Signer {
  const pair = generateKeyPair();
  const signer = createSigner(pair.secretKey);
  pair.secretKey.fill(0);
  return signer;
}

const CLOCK = { now: () => new Date("2026-10-03T02:00:00Z") };

describe("memoryAsyncSigner", () => {
  it("signs like the core signer, asynchronously, and shows only its did", async () => {
    const inner = freshSigner();
    const signer = memoryAsyncSigner(inner);
    const message = new Uint8Array([104, 101, 108, 108, 111]);
    expect(signer.did).toBe(inner.did);
    expect(await signer.sign(message)).toEqual(inner.sign(message));
    expect(JSON.stringify(signer)).toBe(JSON.stringify({ did: inner.did }));
  });
});

describe("signWithAsync over the sync core port", () => {
  it("seals a credential that verifies and equals the one signed synchronously (Ed25519 is deterministic)", async () => {
    const inner = freshSigner();
    const sync = buildCredential(m0SealRequest(CLOCK.now()), { delegator: inner, clock: CLOCK }, "mnd_ABCDEFGHIJ", inner.did);
    const { proof: _proof, ...unsigned } = sync;
    const viaAsync = await signWithAsync(memoryAsyncSigner(inner), (s) => signMandateCredential(unsigned, s, { created: CLOCK.now() }));
    expect(viaAsync).toEqual(sync);
    expect(verifyMandateCredential(viaAsync, { expectedIssuer: inner.did }).valid).toBe(true);
  });

  it("signs revocations and escalation answers the engine accepts", async () => {
    const inner = freshSigner();
    const signer = memoryAsyncSigner(inner);
    const revocation = await signWithAsync(signer, (s) => signRevocation({ mandate_id: "mnd_ABCDEFGHIJ", revoked_at: CLOCK.now() }, s));
    expect(verifyRevocation(revocation, inner.did).valid).toBe(true);
    const binding = { decision_id: "dec_ABCDEFGHIJ", mandate_id: "mnd_ABCDEFGHIJ", cart: REFERENCE_CART };
    const answer = await signWithAsync(signer, (s) => signEscalationAnswer({ ...binding, choice: "DENY", answered_at: CLOCK.now() }, s));
    expect(verifyEscalationAnswer(answer, inner.did, binding).valid).toBe(true);
  });

  it("hands the async signer exactly the bytes the core signs, once", async () => {
    const inner = freshSigner();
    const seen: Uint8Array[] = [];
    const spy: AsyncSigner = { did: inner.did, sign: (m) => (seen.push(m), Promise.resolve(inner.sign(m))) };
    const input = { mandate_id: "mnd_ABCDEFGHIJ", revoked_at: CLOCK.now() };
    await signWithAsync(spy, (s) => signRevocation(input, s));
    expect(seen).toHaveLength(1);
    expect(new TextDecoder().decode(seen[0])).toMatch(/^laisee\.revoke\.v1:[0-9a-f]{64}$/);
    expect(seen[0]).toEqual(delegatorSigningMessage("laisee.revoke.v1", { mandate_id: "mnd_ABCDEFGHIJ", revoked_at: CLOCK.now().toISOString(), signer: inner.did }));
  });

  it("fails closed when the signer refuses, returns a malformed signature, or the bytes change between runs", async () => {
    const inner = freshSigner();
    const input = { mandate_id: "mnd_ABCDEFGHIJ", revoked_at: CLOCK.now() };
    const refusing: AsyncSigner = { did: inner.did, sign: () => Promise.reject(new Error("the shopper said no")) };
    await expect(signWithAsync(refusing, (s) => signRevocation(input, s))).rejects.toThrow("the shopper said no");
    const short: AsyncSigner = { did: inner.did, sign: () => Promise.resolve(new Uint8Array(10)) };
    await expect(signWithAsync(short, (s) => signRevocation(input, s))).rejects.toThrow(AsyncSignError);
    let tick = 0;
    const drifting = vi.fn((s: Signer) => signRevocation({ mandate_id: "mnd_ABCDEFGHIJ", revoked_at: new Date(Date.UTC(2026, 9, 3, 2, 0, tick++)) }, s));
    await expect(signWithAsync(memoryAsyncSigner(inner), drifting)).rejects.toThrow(/changed/);
    const nothing = (): string => "unsigned";
    await expect(signWithAsync(memoryAsyncSigner(inner), nothing)).rejects.toThrow(/nothing to sign/);
  });
});
