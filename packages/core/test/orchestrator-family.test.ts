// Family seal at the orchestrator, with fakes: a child credential that names a parent is sealed only under a verified parent
// credential and inside its rules; every refusal logs nothing. The whole storyline on the real rail is in
// packages/rail-sim/test/orchestrator-family.test.ts.
import { describe, expect, it } from "vitest";
import { createSigner } from "../src/crypto";
import { createAllocationLedger, parentLinkOf } from "../src/family";
import type { CompiledRules, MandateCredential } from "../src/generated";
import { signMandateCredential, type UnsignedMandateCredential } from "../src/vc";
import { testSeed } from "./crypto-independent";
import { SEAL_AT, rig, type Rig } from "./orchestrator-helpers";

const MUM = createSigner(testSeed("mum"));
const PARENT_ID = "mnd_mumP0001";

function mumCredential(r: Rig, over: { readonly budgetMinor?: number; readonly issuer?: typeof MUM } = {}): MandateCredential {
  const { proof: _p, ...base } = r.credential;
  const issuer = over.issuer ?? MUM;
  const rules: CompiledRules = { ...base.credentialSubject.rules, budget: { amount_minor: over.budgetMinor ?? 100_000, currency: "HKD" } };
  const unsigned: UnsignedMandateCredential = { ...base, id: `urn:laisee:mandate:${PARENT_ID}`, issuer: issuer.did, credentialSubject: { id: r.keys.delegator.did, intent_text: "HK$1,000 for clothes.", rules } };
  return signMandateCredential(unsigned, issuer, { created: new Date(SEAL_AT) });
}

function child(r: Rig, parent: MandateCredential, budgetMinor: number): MandateCredential {
  const { proof: _p, ...base } = r.credential;
  const rules: CompiledRules = { ...base.credentialSubject.rules, budget: { amount_minor: budgetMinor, currency: "HKD" } };
  const unsigned: UnsignedMandateCredential = { ...base, credentialSubject: { ...base.credentialSubject, rules, parent: parentLinkOf(parent) } };
  return signMandateCredential(unsigned, r.keys.delegator, { created: new Date(SEAL_AT) });
}

const family = () => {
  const allocations = createAllocationLedger();
  return { allocations, r: rig({ extra: { parentDid: MUM.did, allocations } }) };
};

describe("family seal (fakes)", () => {
  it("seals inside the parent's rules, logs the child with its link, and reports what the parent has left", async () => {
    const { r, allocations } = family();
    const mum = mumCredential(r);
    const sealed = await r.orchestrator.seal(child(r, mum, 80_000), { parentCredential: mum });
    expect(sealed).toMatchObject({ ok: true, mandate: { parent: parentLinkOf(mum) }, parent: { ceilingMinor: 100_000, allocatedMinor: 80_000, remainingMinor: 20_000 } });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED"]);
    expect(allocations.allocated(PARENT_ID)).toBe(80_000);
    expect(r.events.find((e) => e.type === "mandate.sealed")).toMatchObject({ parent: { remainingMinor: 20_000 } });
  });

  it("refuses a budget over the ceiling as EXCEEDS_PARENT with the details, before anything is logged or reserved", async () => {
    const { r, allocations } = family();
    const mum = mumCredential(r);
    expect(await r.orchestrator.seal(child(r, mum, 150_000), { parentCredential: mum })).toMatchObject({
      ok: false,
      code: "EXCEEDS_PARENT",
      details: { field: "budget", requested: 150_000, allowed: 100_000 },
    });
    expect(await r.kinds()).toEqual([]);
    expect(allocations.allocated(PARENT_ID)).toBe(0);
  });

  it("refuses without the parent credential, without a pinned parent key, and with a credential the pinned key did not sign", async () => {
    const { r } = family();
    const mum = mumCredential(r);
    const linked = child(r, mum, 80_000);
    expect(await r.orchestrator.seal(linked)).toMatchObject({ ok: false, code: "INVALID_CREDENTIAL" });
    const impostor = mumCredential(r, { issuer: createSigner(testSeed("impostor")) });
    expect(await r.orchestrator.seal(child(r, impostor, 80_000), { parentCredential: impostor })).toMatchObject({ ok: false, code: "INVALID_CREDENTIAL" });
    const unpinned = rig();
    const mumToo = mumCredential(unpinned);
    expect(await unpinned.orchestrator.seal(child(unpinned, mumToo, 80_000), { parentCredential: mumToo })).toMatchObject({ ok: false, code: "INVALID_CREDENTIAL" });
    expect(await r.kinds()).toEqual([]);
    expect(await unpinned.kinds()).toEqual([]);
  });

  it("a plain credential seals as before, and refuses a parent credential it never named", async () => {
    const { r } = family();
    expect(await r.orchestrator.seal(r.credential, { parentCredential: mumCredential(r) })).toMatchObject({ ok: false, code: "INVALID_CREDENTIAL" });
    const sealed = await r.orchestrator.seal(r.credential);
    expect(sealed).toMatchObject({ ok: true });
    expect("parent" in sealed).toBe(false);
  });

  it("rejects a parentDid that is not an Ed25519 did:key when the orchestrator is built", () => {
    expect(() => rig({ extra: { parentDid: "did:web:example.com" } })).toThrow(/parentDid/);
  });
});
