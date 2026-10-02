// R1 mandate signature (proof result from DecideContext) and R2 revoked or expired (A-03, A-04).
import { describe, expect, it } from "vitest";
import { evaluateR1, evaluateR2 } from "../src/rules";
import { CART_A1, M0, PACKET_INITIAL, at, packetWith } from "./engine-helpers";

describe("R1 mandate signature valid (delegator key)", () => {
  const base = { mandate: M0, packet: PACKET_INITIAL, cart: CART_A1 };

  it("passes when the caller verified the credential proof", () => {
    const r = evaluateR1({ ...base, proofValid: true });
    expect(r).toMatchObject({ id: "R1", result: "PASS", comparator: "verify" });
    expect(r.inputs).toMatchObject({ signer: M0.delegator, proof: "valid", binding: "ok" });
  });

  it.each([
    [false, "invalid"],
    [undefined, "not_checked"],
    ["true", "not_checked"],
    [1, "not_checked"],
  ])("fails closed when the proof flag is %p (%s)", (flag, proof) => {
    const r = evaluateR1({ ...base, proofValid: flag });
    expect(r).toMatchObject({ result: "FAIL", verdict: "DENY", template_id: "R1.invalid_signature" });
    expect(r.inputs["proof"]).toBe(proof);
  });

  it.each([
    ["mandate_mismatch", { cart: { ...CART_A1, mandate_id: "mnd_otherMandate" } }],
    ["agent_mismatch", { cart: { ...CART_A1, agent: "did:key:z6MkOtherAgentXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" } }],
    ["packet_mismatch", { packet: packetWith(PACKET_INITIAL, { mandate_id: "mnd_otherMandate" }) }],
  ])("denies a cart or packet bound to another mandate or agent (%s)", (binding, patch) => {
    const r = evaluateR1({ ...base, ...patch, proofValid: true });
    expect(r).toMatchObject({ result: "FAIL", verdict: "DENY", template_id: "R1.invalid_signature" });
    expect(r.inputs["binding"]).toBe(binding);
  });

  // Audit S-R1-1: the packet is folded from the sealed credential; a Mandate that disagrees with it is not that credential.
  const widened = { ...M0, rules: { ...M0.rules, budget: { amount_minor: 10_000_000, currency: "HKD" as const } } };
  it.each([
    ["budget_mismatch", { mandate: widened }],
    ["budget_mismatch", { packet: packetWith(PACKET_INITIAL, { budget_minor: 79_999 }) }],
    ["currency_mismatch", { packet: packetWith(PACKET_INITIAL, { currency: "USD" as never }) }],
    ["cart_currency_mismatch", { cart: { ...CART_A1, currency: "USD" as never } }],
    ["expiry_mismatch", { mandate: { ...M0, valid_until: "2099-12-31T00:00:00Z" } }],
    ["expiry_mismatch", { packet: packetWith(PACKET_INITIAL, { expires_at: "not a time" }) }],
  ])("denies a mandate the packet was not folded from (%s)", (binding, patch) => {
    const r = evaluateR1({ ...base, ...patch, proofValid: true });
    expect(r).toMatchObject({ result: "FAIL", verdict: "DENY", template_id: "R1.invalid_signature" });
    expect(r.inputs["binding"]).toBe(binding);
  });

  it("accepts the same expiry instant written another way", () => {
    const packet = packetWith(PACKET_INITIAL, { expires_at: "2026-10-31T15:59:59.000Z" });
    expect(evaluateR1({ ...base, packet, proofValid: true }).result).toBe("PASS");
  });
});

describe("R2 not revoked, not expired", () => {
  const now = at("2026-10-03T02:12:00Z");

  it("passes an active packet before valid_until", () => {
    const r = evaluateR2({ mandate: M0, packet: PACKET_INITIAL, now });
    expect(r).toMatchObject({ id: "R2", result: "PASS", comparator: "<", threshold_ref: "mandate.valid_until" });
    expect(r.inputs).toMatchObject({ revoked: false, now: "2026-10-03T02:12:00.000Z", valid_until: M0.valid_until });
  });

  it("denies a revoked packet with R2.revoked", () => {
    const r = evaluateR2({ mandate: M0, packet: packetWith(PACKET_INITIAL, { status: "REVOKED" }), now });
    expect(r).toMatchObject({ result: "FAIL", verdict: "DENY", template_id: "R2.revoked" });
  });

  it("denies an EXPIRED packet even before valid_until", () => {
    const r = evaluateR2({ mandate: M0, packet: packetWith(PACKET_INITIAL, { status: "EXPIRED" }), now });
    expect(r).toMatchObject({ result: "FAIL", template_id: "R2.expired" });
  });

  it("is expired exactly at valid_until and passes one millisecond before", () => {
    const until = Date.parse(M0.valid_until);
    expect(evaluateR2({ mandate: M0, packet: PACKET_INITIAL, now: new Date(until) })).toMatchObject({ result: "FAIL", template_id: "R2.expired" });
    expect(evaluateR2({ mandate: M0, packet: PACKET_INITIAL, now: new Date(until - 1) }).result).toBe("PASS");
  });

  it("uses the earlier of mandate.valid_until and packet.expires_at", () => {
    const packet = packetWith(PACKET_INITIAL, { expires_at: "2026-10-03T02:00:30Z" });
    expect(evaluateR2({ mandate: M0, packet, now }).template_id).toBe("R2.expired");
  });

  it("denies before valid_from (not yet valid)", () => {
    const r = evaluateR2({ mandate: M0, packet: PACKET_INITIAL, now: at("2026-10-03T01:59:59Z") });
    expect(r).toMatchObject({ result: "FAIL", template_id: "R2.expired" });
    expect(r.inputs["not_yet_valid"]).toBe(true);
  });

  it("fails closed on an unknown packet status or an invalid clock (I5)", () => {
    const unknown = packetWith(PACKET_INITIAL, { status: "PAUSED" as never });
    expect(evaluateR2({ mandate: M0, packet: unknown, now })).toMatchObject({ result: "FAIL", verdict: "DENY", template_id: "R2.revoked" });
    expect(evaluateR2({ mandate: M0, packet: PACKET_INITIAL, now: new Date(Number.NaN) })).toMatchObject({ result: "FAIL", template_id: "R2.expired" });
  });
});
