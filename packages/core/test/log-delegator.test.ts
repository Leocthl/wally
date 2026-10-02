// Delegator-signed payloads: revocation (laisee.revoke.v1) and escalation answer (laisee.resolve.v2).
// Signature = base64url(Ed25519(UTF-8('<domain>:' + hex SHA-256(JCS(object without signature))))).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSigner } from "../src/crypto";
import { cartFingerprint } from "../src/engine/hash";
import {
  cartSha256,
  RESOLVE_DOMAIN,
  REVOKE_DOMAIN,
  signEscalationAnswer,
  signRevocation,
  verifyEscalationAnswer,
  verifyRevocation,
  type AnswerBinding,
} from "../src/log";
import type { Cart } from "../src/generated";
import { validateEscalationAnswer, validateRevocation } from "../src/schema";
import { listFixtureFiles, loadFixture } from "../src/testing/fixtures";
import { indepDelegatorSignature, indepJcs, indepSha256Hex, testSeed } from "./crypto-independent";
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

// The escalated decision an answer binds (laisee.resolve.v2): the attempt-1 cart under mandate M0.
const CART = loadFixture("carts/attempt-1.json", "cart");
const BINDING: AnswerBinding = { decision_id: "dec_demoE1", mandate_id: MANDATE_ID, cart: CART };
const sign = (choice: "APPROVE" | "DENY", signer = delegator) => signEscalationAnswer({ ...BINDING, choice, answered_at: AT }, signer);

describe("escalation answer (laisee.resolve.v2)", () => {
  it("is schema-valid, binds mandate and cart, and matches the independent path", () => {
    const answer = sign("APPROVE");
    expect(validateEscalationAnswer(answer).ok).toBe(true);
    expect(RESOLVE_DOMAIN).toBe("laisee.resolve.v2");
    const { id: _id, proposed_at: _proposedAt, ...priced } = CART;
    expect(answer).toMatchObject({ decision_id: "dec_demoE1", mandate_id: MANDATE_ID, cart_sha256: indepSha256Hex(indepJcs(priced)) });
    const { signature, ...unsigned } = answer;
    expect(signature).toBe(indepDelegatorSignature(RESOLVE_DOMAIN, unsigned, DELEGATOR_SEED));
    expect(verifyEscalationAnswer(answer, delegator.did, BINDING)).toEqual({ valid: true, reason: null });
  });

  it("binds decision_id, choice, mandate_id and cart_sha256 into the signature", () => {
    const answer = sign("DENY");
    const changed: unknown[] = [
      { ...answer, choice: "APPROVE" },
      { ...answer, decision_id: "dec_demoE9" },
      { ...answer, mandate_id: "mnd_otherM1" },
      { ...answer, cart_sha256: "0".repeat(64) },
    ];
    for (const c of changed) expect(verifyEscalationAnswer(c, delegator.did, BINDING)).toMatchObject({ valid: false, reason: "SIGNATURE" });
  });

  it("refuses a valid answer offered for another decision, mandate or cart (BINDING)", () => {
    const answer = sign("APPROVE");
    const otherCart = { ...CART, total_minor: CART.total_minor + 100, subtotal_minor: CART.subtotal_minor + 100 };
    const wrong: AnswerBinding[] = [
      { ...BINDING, decision_id: "dec_demoE9" },
      { ...BINDING, mandate_id: "mnd_otherM1" },
      { ...BINDING, cart: otherCart },
      { ...BINDING, cart: { ...CART, merchant: { ...CART.merchant, domain: "other-shop.example" } } },
    ];
    for (const expected of wrong) expect(verifyEscalationAnswer(answer, delegator.did, expected)).toMatchObject({ valid: false, reason: "BINDING" });
  });

  it("ignores the cart id and proposal time: a re-proposed identical cart is the same cart", () => {
    const answer = sign("APPROVE");
    const reproposed = { ...CART, id: "crt_reproposed01", proposed_at: "2026-10-03T03:00:00Z" };
    expect(verifyEscalationAnswer(answer, delegator.did, { ...BINDING, cart: reproposed }).valid).toBe(true);
  });

  it("fails closed without a binding to check against", () => {
    const answer = sign("APPROVE");
    const loose = verifyEscalationAnswer as (input: unknown, did: string, expected?: unknown) => ReturnType<typeof verifyEscalationAnswer>;
    for (const expected of [undefined, null, {}, { decision_id: "dec_demoE1", mandate_id: MANDATE_ID }]) {
      expect(loose(answer, delegator.did, expected)).toMatchObject({ valid: false, reason: "BINDING" });
    }
  });

  it("has no v1 path: a v1-shaped answer fails SCHEMA, and v2 fields signed under the v1 domain fail SIGNATURE", () => {
    const v1Unsigned = { decision_id: "dec_demoE1", choice: "APPROVE", answered_at: AT.toISOString(), signer: delegator.did };
    const v1 = { ...v1Unsigned, signature: indepDelegatorSignature("laisee.resolve.v1", v1Unsigned, DELEGATOR_SEED) };
    expect(verifyEscalationAnswer(v1, delegator.did, BINDING)).toMatchObject({ valid: false, reason: "SCHEMA" });
    const { signature: _signature, ...unsigned } = sign("APPROVE");
    const oldDomain = { ...unsigned, signature: indepDelegatorSignature("laisee.resolve.v1", unsigned, DELEGATOR_SEED) };
    expect(verifyEscalationAnswer(oldDomain, delegator.did, BINDING)).toMatchObject({ valid: false, reason: "SIGNATURE" });
  });

  it("is domain-separated: the same bytes signed as a revoke do not verify as an answer", () => {
    const { signature: _signature, ...unsigned } = sign("APPROVE");
    const crossDomain = { ...unsigned, signature: indepDelegatorSignature(REVOKE_DOMAIN, unsigned, DELEGATOR_SEED) };
    expect(verifyEscalationAnswer(crossDomain, delegator.did, BINDING)).toMatchObject({ valid: false, reason: "SIGNATURE" });
  });

  it("refuses to sign an answer that fails the schema", () => {
    expect(() => signEscalationAnswer({ ...BINDING, decision_id: "nope", choice: "APPROVE", answered_at: AT }, delegator)).toThrow();
    expect(() => signEscalationAnswer({ ...BINDING, mandate_id: "nope", choice: "APPROVE", answered_at: AT }, delegator)).toThrow();
  });
});

describe("cartSha256", () => {
  it("equals the engine's cart fingerprint for every cart fixture and random carts (property)", () => {
    const carts = listFixtureFiles().filter((f) => f.startsWith("carts/")).map((f) => loadFixture(f, "cart"));
    for (const cart of carts) expect(cartSha256(cart)).toBe(cartFingerprint(cart));
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 40 }), fc.nat({ max: 200000 }), (title, price) => {
        const cart: Cart = { ...CART, items: [{ ...CART.items[0], title: title || "x", unit_price_minor: price }] };
        return cartSha256(cart) === cartFingerprint(cart);
      }),
      { numRuns: 60 },
    );
  }, 30_000);
});
