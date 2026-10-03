// Family seal on the real stack (RailSim, MerchantStub, FileLogStore, all SIMULATED): a parent (Mum) seals a ceiling for a
// child (Mei), and Mei gives Wally a share of it. Caps compose: the child's budget is sealed only inside the parent's.
// Mum's credential is verified at seal time and is not in the child's log; the log verifies offline as it always does.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSigner, sha256Bytes } from "@wally/core/crypto";
import { createAllocationLedger, parentLinkOf, type AllocationLedger } from "@wally/core/family";
import type { CompiledRules, MandateCredential } from "@wally/core/generated";
import type { DecidedResult } from "@wally/core/orchestrator";
import type { Signer } from "@wally/core/ports";
import { loadFixture } from "@wally/core/testing/fixtures";
import { signMandateCredential, type UnsignedMandateCredential } from "@wally/core/vc";
import { P_A1, SEAL_AT, TEE, integration, keys, type Integration, type Keys } from "./orchestrator-helpers";

vi.setConfig({ testTimeout: 60_000 }); // explicit: these runs sign, verify and append; slow when the machine is loaded

const signerFor = (role: string): Signer => createSigner(sha256Bytes(`laisee orchestrator integration test key: ${role}`));
const MUM = signerFor("mum");
const PARENT_ID = "mnd_mumP0001";
const K: Keys = keys();

interface Over {
  readonly id?: string;
  readonly issuer?: Signer;
  readonly subject?: string;
  readonly budgetMinor?: number;
  readonly validUntil?: string;
  readonly rules?: Partial<CompiledRules>;
  readonly parent?: MandateCredential["credentialSubject"]["parent"];
}

function unsigned(issuer: string, subject: string, id: string, budgetMinor: number, over: Over): UnsignedMandateCredential {
  const { proof: _proof, ...fixture } = loadFixture("mandate/m0.credential.json", "mandate-credential");
  const rules: CompiledRules = { ...fixture.credentialSubject.rules, budget: { amount_minor: budgetMinor, currency: "HKD" }, ...over.rules };
  return {
    ...fixture,
    id: `urn:laisee:mandate:${id}`,
    issuer,
    validUntil: over.validUntil ?? fixture.validUntil,
    credentialSubject: { id: subject, intent_text: `HK$${budgetMinor / 100}, clothes, verified sellers.`, rules, ...(over.parent === undefined ? {} : { parent: over.parent }) },
  };
}

/** Mum's ceiling: HK$1,000 for clothes at verified sellers, issued to Mei's delegator key. */
function mumCredential(over: Over = {}): MandateCredential {
  const issuer = over.issuer ?? MUM;
  return signMandateCredential(unsigned(issuer.did, over.subject ?? K.delegator.did, over.id ?? PARENT_ID, over.budgetMinor ?? 100_000, over), issuer, { created: new Date(SEAL_AT) });
}

/** Mei's budget for Wally, linked to Mum's credential. */
function meiCredential(parent: MandateCredential, budgetMinor: number, over: Over = {}): MandateCredential {
  const link = over.parent ?? parentLinkOf(parent);
  return signMandateCredential(unsigned(K.delegator.did, K.agentDid, over.id ?? "mnd_demoM0", budgetMinor, { ...over, parent: link }), K.delegator, { created: new Date(SEAL_AT) });
}

const open: Integration[] = [];
afterEach(async () => {
  for (const r of open.splice(0)) await r.close();
});

async function rig(extra: { readonly ledger?: AllocationLedger; readonly parentDid?: string | null } = {}): Promise<Integration> {
  const parentDid = extra.parentDid === undefined ? MUM.did : extra.parentDid;
  const r = await integration("honest", undefined, {
    ...(parentDid === null ? {} : { parentDid }),
    ...(extra.ledger === undefined ? {} : { allocations: extra.ledger }),
  });
  open.push(r);
  return r;
}

describe("a family budget (Mei under Mum)", () => {
  it("seals HK$800 under HK$1,000, reports what Mum has left, and Wally buys inside it", async () => {
    const r = await rig();
    const mum = mumCredential();
    const sealed = await r.orchestrator.seal(meiCredential(mum, 80_000), { parentCredential: mum });
    expect(sealed).toMatchObject({
      ok: true,
      mandate: { id: "mnd_demoM0", parent: parentLinkOf(mum), rules: { budget: { amount_minor: 80_000 } } },
      packet: { budget_minor: 80_000, remaining_minor: 80_000 },
      parent: { mandateId: PARENT_ID, issuer: MUM.did, ceilingMinor: 100_000, allocatedMinor: 80_000, remainingMinor: 20_000 },
    });
    const event = r.events.find((e) => e.type === "mandate.sealed");
    expect(event).toMatchObject({ type: "mandate.sealed", parent: { ceilingMinor: 100_000, allocatedMinor: 80_000, remainingMinor: 20_000 } });

    r.propose(P_A1);
    const bought = (await r.orchestrator.submit({ requestText: "a plain cotton tee", listings: [TEE] })) as DecidedResult;
    expect(bought).toMatchObject({ ok: true, outcome: "APPROVE", card: { limit_minor: 25_900 } });
    expect(await r.orchestrator.checkout({ cardId: bought.card?.id ?? "" })).toMatchObject({ status: "AUTHORISED" });
    expect((await r.orchestrator.snapshot()).packet).toMatchObject({ spent_minor: 25_900, remaining_minor: 54_100 }); // spending is accounted on Mei's packet only
  });

  it("logs the child credential with the parent link, not the parent credential, and the log verifies offline", async () => {
    const r = await rig();
    const mum = mumCredential();
    await r.orchestrator.seal(meiCredential(mum, 80_000), { parentCredential: mum });
    r.propose(P_A1);
    await r.orchestrator.submit({ requestText: "a plain cotton tee", listings: [TEE] });
    const text = await r.logText();
    expect(r.verify(text)).toMatchObject({ ok: true });
    expect(text).toContain(parentLinkOf(mum).mandate_sha256);
    expect(text).not.toContain(MUM.did); // the log names the link, never Mum's credential or key
    expect(await r.kinds()).toEqual(["MANDATE_SEALED", "DECISION", "CARD_MINTED"]);
  });

  it("a budget of exactly Mum's ceiling is allowed", async () => {
    const r = await rig();
    const mum = mumCredential();
    expect(await r.orchestrator.seal(meiCredential(mum, 100_000), { parentCredential: mum })).toMatchObject({ ok: true, parent: { remainingMinor: 0 } });
  });

  it("refuses HK$1,500 under HK$1,000 as EXCEEDS_PARENT with the two amounts, and nothing is logged or reserved", async () => {
    const ledger = createAllocationLedger();
    const r = await rig({ ledger });
    const mum = mumCredential();
    const refused = await r.orchestrator.seal(meiCredential(mum, 150_000), { parentCredential: mum });
    expect(refused).toMatchObject({ ok: false, code: "EXCEEDS_PARENT", details: { field: "budget", requested: 150_000, allowed: 100_000 } });
    expect(refused.ok ? "" : refused.message).toContain("HK$1,500");
    expect((await r.orchestrator.snapshot()).log).toEqual([]);
    expect(await r.kinds()).toEqual([]);
    expect(ledger.allocated(PARENT_ID)).toBe(0);
    expect(r.events.some((e) => e.type === "mandate.sealed" || e.type === "log")).toBe(false);
    expect(r.events.find((e) => e.type === "error")).toMatchObject({ code: "EXCEEDS_PARENT" });
    // the orchestrator is still free: the refused seal did not use it up
    expect(await r.orchestrator.seal(meiCredential(mum, 80_000), { parentCredential: mum })).toMatchObject({ ok: true });
  });

  const ALLOW_LIST: Partial<CompiledRules> = { merchants: { allow: ["demo-apparel.example", "other.example"], deny: [] } };
  it.each([
    ["categories", {}, { categories: ["apparel", "electronics"] }, "categories"],
    ["verified sellers", {}, { seller_check: { require_capture: false } }, "seller_check.require_capture"],
    ["merchants, by dropping Mum's allow list", ALLOW_LIST, {}, "merchants"],
    ["merchants, by adding one", ALLOW_LIST, { merchants: { allow: ["demo-apparel.example", "new.example"], deny: [] } }, "merchants"],
    ["merchants, narrowed (allowed)", ALLOW_LIST, { merchants: { allow: ["demo-apparel.example"], deny: [] } }, null],
  ] as const)("a child that widens %s", async (_name, mumRules, childRules, field) => {
    const r = await rig();
    const mum = mumCredential({ rules: mumRules as Partial<CompiledRules> });
    const result = await r.orchestrator.seal(meiCredential(mum, 80_000, { rules: childRules as Partial<CompiledRules> }), { parentCredential: mum });
    if (field === null) expect(result).toMatchObject({ ok: true });
    else expect(result).toMatchObject({ ok: false, code: "EXCEEDS_PARENT", details: { field } });
  });

  it("refuses a child that outlasts Mum's budget, and any seal after Mum's budget ended", async () => {
    const r = await rig();
    const mum = mumCredential({ validUntil: "2026-10-20T00:00:00Z" });
    expect(await r.orchestrator.seal(meiCredential(mum, 80_000, { validUntil: "2026-10-31T15:59:59Z" }), { parentCredential: mum })).toMatchObject({
      ok: false,
      code: "EXCEEDS_PARENT",
      details: { field: "valid_until", requested: "2026-10-31T15:59:59Z", allowed: "2026-10-20T00:00:00Z" },
    });
    r.clock.advance(18 * 24 * 3_600_000);
    expect(await r.orchestrator.seal(meiCredential(mum, 80_000, { validUntil: "2026-10-20T00:00:00Z" }), { parentCredential: mum })).toMatchObject({ ok: false, code: "EXCEEDS_PARENT", details: { field: "valid_until" } });
    expect(await r.kinds()).toEqual([]);
  });
});

describe("allocation across children of one parent", () => {
  it("each sealed budget takes room off Mum's ceiling until none is left", async () => {
    const ledger = createAllocationLedger();
    const mum = mumCredential();
    const a = await rig({ ledger });
    const b = await rig({ ledger });
    const c = await rig({ ledger });
    expect(await a.orchestrator.seal(meiCredential(mum, 60_000, { id: "mnd_meiA0001" }), { parentCredential: mum })).toMatchObject({ ok: true, parent: { allocatedMinor: 60_000, remainingMinor: 40_000 } });
    expect(await b.orchestrator.seal(meiCredential(mum, 30_000, { id: "mnd_meiB0001" }), { parentCredential: mum })).toMatchObject({ ok: true, parent: { allocatedMinor: 90_000, remainingMinor: 10_000 } });
    const refused = await c.orchestrator.seal(meiCredential(mum, 20_000, { id: "mnd_meiC0001" }), { parentCredential: mum });
    expect(refused).toMatchObject({ ok: false, code: "EXCEEDS_PARENT", details: { field: "budget", requested: 20_000, allowed: 10_000 } });
    expect(await c.orchestrator.seal(meiCredential(mum, 10_000, { id: "mnd_meiC0001" }), { parentCredential: mum })).toMatchObject({ ok: true, parent: { remainingMinor: 0 } });
    expect(ledger.allocated(PARENT_ID)).toBe(100_000);
  });

  it("releasing a replaced budget gives its room back; sealing the same child again is not counted twice", async () => {
    const ledger = createAllocationLedger();
    const mum = mumCredential();
    const first = await rig({ ledger });
    const again = await rig({ ledger });
    await first.orchestrator.seal(meiCredential(mum, 80_000, { id: "mnd_meiA0001" }), { parentCredential: mum });
    expect(await again.orchestrator.seal(meiCredential(mum, 80_000, { id: "mnd_meiA0001" }), { parentCredential: mum })).toMatchObject({ ok: true }); // same child id: replaced, not added
    expect(ledger.allocated(PARENT_ID)).toBe(80_000);
    expect(ledger.release(PARENT_ID, "mnd_meiA0001")).toBe(80_000);
    const next = await rig({ ledger });
    expect(await next.orchestrator.seal(meiCredential(mum, 100_000, { id: "mnd_meiB0001" }), { parentCredential: mum })).toMatchObject({ ok: true });
  });

  it("a seal that fails after the check gives its reservation back", async () => {
    const ledger = createAllocationLedger();
    const r = await integration("honest", undefined, {
      parentDid: MUM.did,
      allocations: ledger,
      appendEntry: () => Promise.reject(new Error("disk full (test)")),
    });
    open.push(r);
    const mum = mumCredential();
    expect(await r.orchestrator.seal(meiCredential(mum, 80_000), { parentCredential: mum })).toMatchObject({ ok: false, code: "LOG_APPEND_FAILED" });
    expect(ledger.allocated(PARENT_ID)).toBe(0);
  });
});

describe("what makes Mum's credential count", () => {
  const refused = (code: string) => expect.objectContaining({ ok: false, code });

  it("needs the parent credential when the child names a parent", async () => {
    const r = await rig();
    const mum = mumCredential();
    expect(await r.orchestrator.seal(meiCredential(mum, 80_000))).toEqual(refused("INVALID_CREDENTIAL"));
    expect(await r.kinds()).toEqual([]);
  });

  it("is refused when no parent key is pinned (fail closed)", async () => {
    const r = await rig({ parentDid: null });
    const mum = mumCredential();
    expect(await r.orchestrator.seal(meiCredential(mum, 80_000), { parentCredential: mum })).toEqual(refused("INVALID_CREDENTIAL"));
    expect(await r.kinds()).toEqual([]);
  });

  it("must be signed by the pinned parent key, not by whoever the child links to", async () => {
    const r = await rig();
    const impostor = mumCredential({ issuer: signerFor("not mum"), budgetMinor: 900_000 });
    const result = await r.orchestrator.seal(meiCredential(impostor, 800_000), { parentCredential: impostor });
    expect(result).toEqual(refused("INVALID_CREDENTIAL"));
    expect(result.ok ? "" : result.message).toContain("WRONG_ISSUER");
    expect(await r.kinds()).toEqual([]);
  });

  it("must verify: a raised ceiling after signing breaks the proof", async () => {
    const r = await rig();
    const mum = mumCredential();
    const raised = { ...mum, credentialSubject: { ...mum.credentialSubject, rules: { ...mum.credentialSubject.rules, budget: { amount_minor: 900_000, currency: "HKD" as const } } } };
    const result = await r.orchestrator.seal(meiCredential(mum, 800_000), { parentCredential: raised });
    expect(result).toEqual(refused("INVALID_CREDENTIAL"));
    expect(result.ok ? "" : result.message).toContain("SIGNATURE");
  });

  it("must be the one the child links to (id and hash of the whole credential)", async () => {
    const r = await rig();
    const mum = mumCredential();
    const other = mumCredential({ budgetMinor: 100_001 }); // same id, same key, different content
    expect(await r.orchestrator.seal(meiCredential(mum, 80_000), { parentCredential: other })).toEqual(refused("INVALID_CREDENTIAL"));
    const wrongId = { mandate_id: "mnd_mumP0002", mandate_sha256: parentLinkOf(mum).mandate_sha256 };
    expect(await r.orchestrator.seal(meiCredential(mum, 80_000, { parent: wrongId }), { parentCredential: mum })).toEqual(refused("INVALID_CREDENTIAL"));
    expect(await r.kinds()).toEqual([]);
  });

  it("must name this delegator as its subject: Mum's budget for someone else is not Mei's", async () => {
    const r = await rig();
    const forKa = mumCredential({ subject: signerFor("ka").did });
    expect(await r.orchestrator.seal(meiCredential(forKa, 80_000), { parentCredential: forKa })).toEqual(refused("INVALID_CREDENTIAL"));
  });

  it("must not have a parent of its own: one level only", async () => {
    const r = await rig();
    const grand = mumCredential({ id: "mnd_grandG001" });
    const mum = mumCredential({ parent: parentLinkOf(grand) });
    expect(await r.orchestrator.seal(meiCredential(mum, 80_000), { parentCredential: mum })).toEqual(refused("INVALID_CREDENTIAL"));
  });

  it("is refused when the child names no parent (a parent credential is never ignored)", async () => {
    const r = await rig();
    const mum = mumCredential();
    const { parent: _link, ...subject } = meiCredential(mum, 80_000).credentialSubject;
    const plain = signMandateCredential({ ...unsigned(K.delegator.did, K.agentDid, "mnd_demoM0", 80_000, {}), credentialSubject: subject }, K.delegator, { created: new Date(SEAL_AT) });
    expect(await r.orchestrator.seal(plain, { parentCredential: mum })).toEqual(refused("INVALID_CREDENTIAL"));
    expect(await r.orchestrator.seal(plain)).toMatchObject({ ok: true }); // a plain budget is sealed as it always was
  });

  it("a plain budget needs no parent key and its seal event carries no parent summary", async () => {
    const r = await rig({ parentDid: null });
    const { proof: _p, ...fixture } = loadFixture("mandate/m0.credential.json", "mandate-credential");
    const plain = signMandateCredential({ ...fixture, issuer: K.delegator.did, credentialSubject: { ...fixture.credentialSubject, id: K.agentDid } }, K.delegator, { created: new Date(SEAL_AT) });
    const sealed = await r.orchestrator.seal(plain);
    expect(sealed).toMatchObject({ ok: true });
    expect("parent" in sealed).toBe(false);
    expect(r.events.find((e) => e.type === "mandate.sealed")).not.toHaveProperty("parent");
  });
});
