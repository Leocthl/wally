// The ledger (how much of a parent's budget is reserved) and the parent link (id plus the hash of the full credential).
import { describe, expect, it } from "vitest";
import { AllocationError, createAllocationLedger, parentLinkOf, sameLink, summarizeParent } from "../src/family";
import { signMandateCredential, type UnsignedMandateCredential } from "../src/vc";
import { NOW, PARENT } from "./family-helpers";
import { demoCredential, demoKeys } from "./log-helpers";

describe("allocation ledger", () => {
  it("adds up reservations per parent and keeps parents apart", () => {
    const ledger = createAllocationLedger();
    expect(ledger.allocated("mnd_p1")).toBe(0);
    ledger.reserve("mnd_p1", "mnd_a", 30_000);
    ledger.reserve("mnd_p1", "mnd_b", 50_000);
    ledger.reserve("mnd_p2", "mnd_a", 7);
    expect(ledger.allocated("mnd_p1")).toBe(80_000);
    expect(ledger.allocated("mnd_p2")).toBe(7);
  });

  it("a child reserved twice counts once (the later amount), and can be left out of the total", () => {
    const ledger = createAllocationLedger();
    ledger.reserve("mnd_p1", "mnd_a", 30_000);
    ledger.reserve("mnd_p1", "mnd_a", 40_000);
    ledger.reserve("mnd_p1", "mnd_b", 10_000);
    expect(ledger.allocated("mnd_p1")).toBe(50_000);
    expect(ledger.allocated("mnd_p1", "mnd_a")).toBe(10_000);
  });

  it("release gives the amount back once; releasing an unknown child changes nothing", () => {
    const ledger = createAllocationLedger();
    ledger.reserve("mnd_p1", "mnd_a", 30_000);
    expect(ledger.release("mnd_p1", "mnd_a")).toBe(30_000);
    expect(ledger.release("mnd_p1", "mnd_a")).toBe(0);
    expect(ledger.release("mnd_p9", "mnd_a")).toBe(0);
    expect(ledger.allocated("mnd_p1")).toBe(0);
  });

  it("refuses an amount that is not a whole number of minor units, zero or more", () => {
    const ledger = createAllocationLedger();
    for (const bad of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2]) {
      expect(() => ledger.reserve("mnd_p1", "mnd_a", bad), String(bad)).toThrow(AllocationError);
    }
    expect(ledger.allocated("mnd_p1")).toBe(0);
  });
});

describe("parent link", () => {
  const parent = demoCredential(demoKeys(), "mnd_parentP001");

  it("names the parent by id and by the hash of the whole credential, proof included", () => {
    const link = parentLinkOf(parent);
    expect(link.mandate_id).toBe("mnd_parentP001");
    expect(link.mandate_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sameLink(link, parentLinkOf(structuredClone(parent)))).toBe(true);
  });

  it("changes with any edit to the parent, with its proof, and with a re-signing", () => {
    const link = parentLinkOf(parent);
    const edited = { ...parent, credentialSubject: { ...parent.credentialSubject, intent_text: "HK$9,000, everything." } };
    expect(sameLink(link, parentLinkOf(edited))).toBe(false);
    const { proof, ...rest } = parent;
    expect(sameLink(link, parentLinkOf({ ...rest, proof: { ...proof, created: "2026-10-03T02:00:01Z" } }))).toBe(false);
    const keys = demoKeys();
    const { proof: _p, ...unsigned } = parent;
    const resigned = signMandateCredential(unsigned as UnsignedMandateCredential, keys.delegator, { created: new Date(NOW.getTime() + 1_000) });
    expect(sameLink(link, parentLinkOf(resigned))).toBe(false);
  });

  it("summarises what a parent has left", () => {
    expect(summarizeParent(PARENT, 80_000)).toEqual({
      mandateId: "mnd_parentP001",
      issuer: PARENT.delegator,
      ceilingMinor: 100_000,
      allocatedMinor: 80_000,
      remainingMinor: 20_000,
      validUntil: PARENT.valid_until,
      categories: ["apparel"],
      verifiedSellersOnly: true,
    });
    expect(summarizeParent(PARENT, 130_000).remainingMinor).toBe(0);
  });
});
