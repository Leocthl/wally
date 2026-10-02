// Audit (lane s-audit): issuer pinning for the AgentDelegationCredential. A did:key credential is
// self-certifying: without a trusted issuer, verifyMandateCredential checks the proof against the key the
// credential names itself. R1 only reads the caller's boolean (DecideContext.mandateProofValid), so the
// orchestrator's call is the whole trust decision.
import { describe, expect, it } from "vitest";
import { createSigner } from "../src/crypto";
import { engine } from "../src/engine";
import type { Cart, Mandate } from "../src/generated";
import { verifyChain } from "../src/verify";
import { signMandateCredential, verifyMandateCredential, type UnsignedMandateCredential } from "../src/vc";
import { testSeed } from "./crypto-independent";
import { CART_A1, JUDGE_TEE, M0, PACKET_INITIAL, PROOF_OK } from "./engine-helpers";
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
// The pin is mandatory in the type since the fix; a JavaScript caller (or a cast) can still omit it at runtime.
const verifyLoosely = verifyMandateCredential as (input: unknown, opts?: unknown) => ReturnType<typeof verifyMandateCredential>;
const UNPINNED = verifyLoosely(SELF_ISSUED);
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

describe("S-VC-1 (fixed): verifyMandateCredential fails closed when no trusted issuer is given", () => {
  it("setup: Mallory's credential is well formed and carries a HK$999,999.99 packet", () => {
    expect(verifyMandateCredential(SELF_ISSUED, { expectedIssuer: mallory.did }).valid).toBe(true);
    expect(SELF_ISSUED.credentialSubject.rules.budget.amount_minor).toBe(99_999_999);
  });

  it("without expectedIssuer the check must fail closed (I5), not trust the credential's own key", () => {
    expect(UNPINNED.valid).toBe(false);
    expect(UNPINNED).toMatchObject({ reason: "ISSUER_UNPINNED" });
    expect(verifyLoosely(SELF_ISSUED, { expectedIssuer: undefined })).toMatchObject({ valid: false, reason: "ISSUER_UNPINNED" });
  });
});

// ---- R1 binding: the Mandate object the caller passes is not tied to the credential the packet was folded from ----

const NOW = new Date("2026-10-03T02:05:00Z");
const WIDENED: Mandate = {
  ...M0,
  rules: { ...M0.rules, budget: { amount_minor: 10_000_000, currency: "HKD" }, categories: ["apparel", "electronics"], seller_check: { require_capture: false } },
};
const GADGET: Cart = {
  ...CART_A1,
  items: [{ ...CART_A1.items[0], category: "electronics" }],
  scameter: { state: "NOT_CHECKED", capture_ref: null, captured_at: null, searched: [] },
};
const NARROW_DECISION = engine.decide(M0, PACKET_INITIAL, GADGET, JUDGE_TEE, NOW, undefined, PROOF_OK);
const WIDE_DECISION = engine.decide(WIDENED, PACKET_INITIAL, GADGET, JUDGE_TEE, NOW, undefined, PROOF_OK);

describe("R1 binding (controls)", () => {
  it("the sealed mandate denies the off-mandate cart; the packet carries the sealed budget", () => {
    expect(NARROW_DECISION.outcome).toBe("DENY");
    expect(PACKET_INITIAL.budget_minor).toBe(M0.rules.budget.amount_minor);
  });
});

// FIXED (lane s-fix-core): R1 also binds the packet's budget, currency and expiry and the cart's currency to the Mandate
// (inputs.binding names the mismatch), so a widened copy no longer rides on the credential's proof flag.
describe("S-R1-1 (fixed): R1 binds the Mandate to the packet folded from the credential", () => {
  it("R1 fails when the mandate's budget or expiry differ from the packet folded from the credential", () => {
    expect(WIDE_DECISION.outcome).not.toBe("APPROVE");
    expect(WIDE_DECISION.rules.find((r) => r.id === "R1")).toMatchObject({ result: "FAIL", inputs: { binding: "budget_mismatch" } });
  });
});

// Residual, kept red on purpose: PacketState carries no fingerprint of the rules, so a copy that widens only the
// categories (same budget, currency and expiry) still passes R1. The orchestrator is not exposed (it builds the
// Mandate from the logged credential); closing it in the engine needs a rules hash in PacketState or the credential
// in DecideContext (schema and port changes, lead-owned).
const CATEGORIES_ONLY: Mandate = { ...M0, rules: { ...M0.rules, categories: ["apparel", "electronics"], seller_check: { require_capture: false } } };
const CATEGORIES_ONLY_DECISION = engine.decide(CATEGORIES_ONLY, PACKET_INITIAL, GADGET, JUDGE_TEE, NOW, undefined, PROOF_OK);

describe("KNOWN RESIDUAL S-R1-1b: a categories-only widening is invisible to R1", () => {
  it.fails("R1 fails for a Mandate whose categories differ from the sealed credential", () => {
    expect(CATEGORIES_ONLY_DECISION.outcome).not.toBe("APPROVE");
  });
});
