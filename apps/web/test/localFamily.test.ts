// Family budget on the on-device stack (the real orchestrator, engine, signed log and SIMULATED rail, in process): Mum
// seals a ceiling of HK$1,000 for clothes, Mei gives Wally a share. Caps compose: a budget over what Mum allows is refused
// as EXCEEDS_PARENT and changes nothing. Mum's credential is not in the log; the offline verifier checks Mei's budget only.
import { verifyLogText } from "@wally/core/verify";
import { seededRandom } from "@wally/rail-sim";
import { afterEach, describe, expect, it } from "vitest";
import { LocalApiClient } from "../src/api/local/LocalApiClient";
import { m0SealRequest } from "../src/api/mock/presets";
import type { ApiFeatures, BoothSnapshot, SealRequest, TraceEvent } from "../src/api/types";

const open: LocalApiClient[] = [];
afterEach(() => {
  for (const c of open.splice(0)) c.dispose();
});

function booth(features?: Partial<ApiFeatures>): { client: LocalApiClient; events: TraceEvent[] } {
  const client = new LocalApiClient({ railRandom: () => seededRandom(7), tickMs: null, ...(features === undefined ? {} : { features }) });
  open.push(client);
  const events: TraceEvent[] = [];
  client.subscribe((e) => events.push(e));
  return { client, events };
}

/** A snapshot to compare: the packet is folded at the moment it is read, so its stamp always moves. */
const stable = (snap: BoothSnapshot) => ({ ...snap, packet: snap.packet === null ? null : { ...snap.packet, computed_at: "" } });

/** Mei's share: the preset budget with another amount, as her own or under Mum's. */
function budget(amountMinor: number, family = true): SealRequest {
  const m0 = m0SealRequest(new Date());
  return { ...m0, rules: { ...m0.rules, budget: { amount_minor: amountMinor, currency: "HKD" } }, ...(family ? { family: { parent: "mum" as const } } : {}) };
}

async function sealedOwn(): Promise<ReturnType<typeof booth>> {
  const b = booth();
  await b.client.seal(m0SealRequest(new Date()));
  return b;
}

describe("Mum's budget", () => {
  it("is on in on-device mode, and says what Mum allows", async () => {
    const { client } = await sealedOwn();
    expect((await client.info()).features.family).toBe(true);
    const m0 = m0SealRequest(new Date());
    expect(await client.family()).toMatchObject({
      parent: "mum",
      ceilingMinor: 100_000,
      allocatedMinor: 0,
      remainingMinor: 100_000,
      categories: ["apparel"],
      verifiedSellersOnly: true,
      validUntil: m0.validUntil,
    });
  });

  it("makes Mum once: the same credential until a reset", async () => {
    const { client } = await sealedOwn();
    const first = await client.family();
    expect((await client.family()).mandateId).toBe(first.mandateId);
    expect(first.issuer).toMatch(/^did:key:z6Mk/);
    await client.reset();
    const second = await client.family();
    expect(second.mandateId).not.toBe(first.mandateId);
    expect(second.issuer).not.toBe(first.issuer);
  });
});

describe("sealing under Mum", () => {
  it("seals HK$800 inside HK$1,000: the budget names its parent, Mum has HK$200 left, and Wally buys inside it", async () => {
    const { client, events } = await sealedOwn();
    const sealed = await client.seal(budget(80_000));
    expect(sealed.mandate.parent).toMatchObject({ mandate_id: (await client.family()).mandateId, mandate_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(sealed.packet).toMatchObject({ budget_minor: 80_000, remaining_minor: 80_000 });
    expect(await client.family()).toMatchObject({ allocatedMinor: 80_000, remainingMinor: 20_000, ceilingMinor: 100_000 });
    expect(events.find((e) => e.type === "mandate.sealed" && e.mandate.parent !== undefined)).toBeDefined();
    const run = await client.runScenario("normal");
    expect(run.outcome).toBe("APPROVE");
    expect((await client.snapshot()).packet).toMatchObject({ budget_minor: 80_000, remaining_minor: 54_100 }); // spending is on Mei's packet only
    expect(await client.family()).toMatchObject({ allocatedMinor: 80_000 }); // Mum's side moved at seal, not at purchase
  });

  it("refuses HK$1,500 as EXCEEDS_PARENT with the two amounts, leaves the budget held as it was, and logs nothing", async () => {
    const { client, events } = await sealedOwn();
    await client.runScenario("normal");
    const before = await client.snapshot();
    const seen = events.length;
    await expect(client.seal(budget(150_000))).rejects.toMatchObject({
      status: 422,
      code: "EXCEEDS_PARENT",
      message: "That's more than Mum allows (HK$1,000).",
      details: { field: "budget", requested: 150_000, allowed: 100_000 },
    });
    expect(stable(await client.snapshot())).toEqual(stable(before));
    expect(events.slice(seen)).toEqual([]); // no reset, no mandate.sealed: the visitor sees nothing happen
    expect(await client.family()).toMatchObject({ allocatedMinor: 0 });
    expect((await client.getLog()).entries.some((e) => e.kind === "MANDATE_SEALED" && e.payload.credentialSubject.parent !== undefined)).toBe(false);
  });

  it("replaces a family budget: the old share is given back first, a bigger one still has to fit, and a refusal keeps the old one", async () => {
    const { client } = await sealedOwn();
    await client.seal(budget(80_000));
    const held = (await client.snapshot()).mandate?.id;
    const second = await client.seal(budget(90_000)); // 80 + 90 would not fit; replacing 80 with 90 does
    expect(second.mandate.id).not.toBe(held);
    expect(await client.family()).toMatchObject({ allocatedMinor: 90_000, remainingMinor: 10_000 });
    await expect(client.seal(budget(110_000))).rejects.toMatchObject({ code: "EXCEEDS_PARENT", details: { requested: 110_000, allowed: 100_000 } });
    expect((await client.snapshot()).mandate?.id).toBe(second.mandate.id); // the refused seal changed nothing
    expect(await client.family()).toMatchObject({ allocatedMinor: 90_000 }); // and its share is still held
    await client.seal(budget(100_000)); // the whole ceiling, exactly
    expect(await client.family()).toMatchObject({ allocatedMinor: 100_000, remainingMinor: 0 });
  });

  it("a budget of Mei's own gives Mum's share back, and reset starts a new Mum", async () => {
    const { client } = await sealedOwn();
    await client.seal(budget(80_000));
    const mum = (await client.family()).mandateId;
    await client.seal(budget(50_000, false));
    expect(await client.family()).toMatchObject({ mandateId: mum, allocatedMinor: 0 });
    await client.seal(budget(80_000));
    await client.reset();
    expect((await client.snapshot()).mandate?.parent).toBeUndefined();
    expect(await client.family()).toMatchObject({ allocatedMinor: 0 });
  });

  it("cancelling a family budget gives Mum's share back", async () => {
    const { client } = await sealedOwn();
    await client.seal(budget(80_000));
    expect(await client.family()).toMatchObject({ allocatedMinor: 80_000 });
    await client.revoke();
    expect(await client.family()).toMatchObject({ allocatedMinor: 0, remainingMinor: 100_000 });
    await client.seal(budget(100_000)); // the whole ceiling is Mum's to give again
    expect(await client.family()).toMatchObject({ allocatedMinor: 100_000 });
  });

  it("refuses every other way a child can widen Mum's rules, citing the rule", async () => {
    const { client } = await sealedOwn();
    const withRules = (rules: Partial<SealRequest["rules"]>): SealRequest => ({ ...budget(50_000), rules: { ...budget(50_000).rules, ...rules } });
    await expect(client.seal(withRules({ categories: ["apparel", "electronics"] }))).rejects.toMatchObject({ code: "EXCEEDS_PARENT", details: { field: "categories" } });
    await expect(client.seal(withRules({ seller_check: { require_capture: false } }))).rejects.toMatchObject({ code: "EXCEEDS_PARENT", details: { field: "seller_check.require_capture" } });
    const later = { ...budget(50_000), validUntil: "2099-01-01T00:00:00Z" };
    await expect(client.seal(later)).rejects.toMatchObject({ code: "EXCEEDS_PARENT", details: { field: "valid_until" } });
    expect((await client.getLog()).entries).toHaveLength(1); // still only the preset budget's seal
  });

  it("the budget's log verifies offline with the budget's keys; Mum's credential is exported beside it, not in it", async () => {
    const { client } = await sealedOwn();
    const mum = await client.family();
    await client.seal(budget(80_000));
    await client.runScenario("normal");
    const exported = await client.exportLog();
    expect(verifyLogText(exported.log, { engine: exported.publicKeys.engine, delegator: exported.publicKeys.delegator }, exported.checkpoint ?? undefined)).toMatchObject({ ok: true });
    expect(exported.log).not.toContain(mum.issuer); // the log carries the link, never Mum's key or credential
    expect(exported.publicKeys.parent).toBe(mum.issuer);
    expect(exported.parentCredential).toMatchObject({ issuer: mum.issuer, id: `urn:laisee:mandate:${mum.mandateId}`, credentialSubject: { id: exported.publicKeys.delegator } });
    expect(exported.parentNote).toMatch(/cannot check this link/);
    const own = booth();
    await own.client.seal(m0SealRequest(new Date()));
    expect((await own.client.exportLog()).parentCredential).toBeUndefined();
  });
});

describe("family scenarios", () => {
  it("family_ok starts fresh from a budget of Mei's own: Mum seals, Mei seals HK$800 under her, the tee is bought", async () => {
    const { client, events } = await sealedOwn();
    const before = await client.family();
    const run = await client.runScenario("family_ok");
    expect(run).toMatchObject({ scenario: "family_ok", outcome: "APPROVE" });
    const snap = await client.snapshot();
    expect(snap.mandate).toMatchObject({ rules: { budget: { amount_minor: 80_000 } }, parent: { mandate_id: expect.any(String) } });
    expect(snap.packet).toMatchObject({ remaining_minor: 54_100 });
    expect(snap.cards).toHaveLength(1);
    const after = await client.family();
    expect(after.mandateId).not.toBe(before.mandateId); // a fresh Mum
    expect(after).toMatchObject({ allocatedMinor: 80_000 });
    const mine = events.filter((e) => "runId" in e && e.runId === run.runId).map((e) => e.type);
    expect(mine[0]).toBe("run.started");
    expect(mine.at(-1)).toBe("run.finished");
    expect(events.findIndex((e) => e.type === "reset")).toBeLessThan(events.findIndex((e) => e.type === "run.started" && e.runId === run.runId));
  });

  it("family_ok works from any state and again and again: after purchases, after a revoke, after itself", async () => {
    const { client } = await sealedOwn();
    await client.runScenario("normal");
    await client.revoke();
    for (let i = 0; i < 3; i += 1) {
      expect((await client.runScenario("family_ok")).outcome).toBe("APPROVE");
      expect((await client.snapshot()).packet).toMatchObject({ status: "ACTIVE", budget_minor: 80_000, remaining_minor: 54_100 });
      expect(await client.family()).toMatchObject({ allocatedMinor: 80_000 });
    }
  });

  it("family_over is refused with EXCEEDS_PARENT and leaves everything as it was, whatever the state", async () => {
    const { client, events } = await sealedOwn();
    await client.runScenario("normal");
    for (const start of ["own", "family"] as const) {
      if (start === "family") await client.runScenario("family_ok");
      const before = await client.snapshot();
      const mum = await client.family();
      const seen = events.length;
      const run = await client.runScenario("family_over");
      expect(run).toMatchObject({ scenario: "family_over", outcome: "DENY", code: "EXCEEDS_PARENT", note: "That's more than Mum allows (HK$1,000)." });
      expect(run.decisionId).toBeUndefined();
      expect(stable(await client.snapshot())).toEqual(stable(before)); // same budget, same log, same cards
      expect(await client.family()).toEqual(mum);
      const fresh = events.slice(seen);
      expect(fresh.map((e) => e.type)).toEqual(["run.started", "run.finished"]);
      expect(fresh.at(-1)).toMatchObject({ type: "run.finished", outcome: "DENY", note: "That's more than Mum allows (HK$1,000)." });
    }
  });

  it("is refused outright when the booth turns family budgets off", async () => {
    const { client } = booth({ family: false });
    await client.seal(m0SealRequest(new Date()));
    expect((await client.info()).features.family).toBe(false);
    await expect(client.seal(budget(80_000))).rejects.toMatchObject({ status: 404, code: "FAMILY_OFF" });
    await expect(client.family()).rejects.toMatchObject({ code: "FAMILY_OFF" });
    const run = await client.runScenario("family_ok");
    expect(run).toMatchObject({ outcome: "ERROR", code: "FAMILY_OFF" });
    expect((await client.snapshot()).mandate?.parent).toBeUndefined();
    expect((await client.runScenario("normal")).outcome).toBe("APPROVE"); // the default flow is untouched
  });
});

describe("the seal request", () => {
  it("accepts only { parent: 'mum' } as family, like the HTTP route", async () => {
    const { client } = await sealedOwn();
    const bad = (family: unknown) => client.seal({ ...budget(50_000, false), family } as unknown as SealRequest);
    await expect(bad({ parent: "dad" })).rejects.toMatchObject({ code: "INVALID_FIELD" });
    await expect(bad("mum")).rejects.toMatchObject({ code: "INVALID_FIELD" });
    await expect(bad(null)).rejects.toMatchObject({ code: "INVALID_FIELD" });
    await expect(bad({ parent: "mum", extra: 1 })).rejects.toMatchObject({ code: "UNKNOWN_FIELD" });
    expect((await client.snapshot()).mandate?.parent).toBeUndefined();
  });
});
