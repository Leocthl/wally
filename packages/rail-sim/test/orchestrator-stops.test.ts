// T-S1..T-S6 through the orchestrator on RailSim + MerchantStub + FileLogStore (SIMULATED), each finishing with
// verifyChain over the exported log (passes) and one flipped byte (fails).
import { afterEach, describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "@laisee/core/config";
import type { ListingRecord, ProposeCartInput } from "@laisee/core/generated";
import type { DecidedResult } from "@laisee/core/orchestrator";
import { HOODIE, INJECTED, JACKET, P_A1, P_A2, P_A3, P_A3B, P_A4, SOCKS, TEE, credential, flipOneByte, integration, type Integration } from "./orchestrator-helpers";

let open: Integration | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

async function sealed(mode: Parameters<typeof integration>[0] = "honest", validUntil?: string): Promise<Integration> {
  const r = (open = await integration(mode));
  expect(await r.orchestrator.seal(credential(r.keys, validUntil))).toMatchObject({ ok: true });
  return r;
}

async function submit(r: Integration, proposal: ProposeCartInput, listing: ListingRecord): Promise<DecidedResult> {
  r.propose(proposal);
  const result = await r.orchestrator.submit({ requestText: "shopper request", listings: [listing] });
  expect(result.ok).toBe(true);
  return result as DecidedResult;
}

async function expectVerifies(r: Integration): Promise<void> {
  const text = await r.logText();
  expect(r.verify(text)).toMatchObject({ ok: true });
  expect(r.verify(flipOneByte(text))).toMatchObject({ ok: false });
}

describe("T-S1 over budget incl. shipping (R3) and the rail overshoot decline", () => {
  it("DENY R3 before mint; after a mint, an overshoot is DECLINED OVER_LIMIT with the limit held", async () => {
    const r = await sealed("overshoot");
    const a1 = await submit(r, P_A1, TEE);
    expect(await r.orchestrator.checkout({ cardId: a1.card?.id ?? "" })).toMatchObject({ status: "DECLINED", event: { decline_code: "OVER_LIMIT" } });
    expect((await r.orchestrator.snapshot()).packet).toMatchObject({ committed_minor: 25900, spent_minor: 0 });
    const a3 = await submit(r, P_A3, JACKET);
    expect(a3).toMatchObject({ outcome: "DENY", card: null, decision: { explanation: { template_id: "R3.over_remaining", inputs: { total_minor: 55000, remaining_minor: 54100 } } } });
    expect(r.rail.cards).toHaveLength(1);
    await expectVerifies(r);
  });
});

describe("T-S2 flagged or unverified seller (R9)", () => {
  it("flagged: DENY R9.flagged, the card never exists; unverified: ESCALATE R9.unverified, answered by the delegator", async () => {
    const r = await sealed();
    expect(await submit(r, P_A2, HOODIE)).toMatchObject({ outcome: "DENY", card: null, decision: { explanation: { template_id: "R9.flagged" } } });
    const esc = await submit(r, P_A1, { ...TEE, scameter_ref: null });
    expect(esc).toMatchObject({ outcome: "ESCALATE", escalation: { state: "OPEN", templateId: "R9.unverified" } });
    r.clock.advance(20_000);
    const answered = await r.orchestrator.answerEscalation(r.answer(esc.decision.id, "APPROVE"));
    expect(answered).toMatchObject({ ok: true, outcome: "APPROVE", card: { limit_minor: 25900 }, decision: { resolves: esc.decision.id } });
    expect(r.rail.cards).toHaveLength(1);
    await expectVerifies(r);
  });
});

describe("T-S3 injected listing (R10)", () => {
  it("DENY R10.injection from the judge's typed answers; the planner never saw the listing text", async () => {
    const r = await sealed();
    expect(await submit(r, P_A3B, INJECTED)).toMatchObject({ outcome: "DENY", card: null, decision: { explanation: { template_id: "R10.injection" } } });
    expect(r.rail.cards).toEqual([]);
    await expectVerifies(r);
  });
});

describe("T-S4 revoke (R2, rail void)", () => {
  it("voids the ACTIVE card, a racing submit is DENY R2.revoked, nothing mints after, and the voided card cannot be charged", async () => {
    const r = await sealed();
    const a1 = await submit(r, P_A1, TEE);
    r.propose(P_A4);
    const [revoked, racing] = await Promise.all([
      r.orchestrator.revoke(r.revocation()),
      r.orchestrator.submit({ requestText: "socks", listings: [SOCKS] }),
    ]);
    expect(revoked).toMatchObject({ ok: true, voidedCardIds: [a1.card?.id] });
    expect(racing).toMatchObject({ ok: true, outcome: "DENY", card: null, decision: { explanation: { template_id: "R2.revoked" } } });
    expect(await r.orchestrator.checkout({ cardId: a1.card?.id ?? "" })).toMatchObject({ status: "DECLINED", event: { decline_code: "CARD_VOIDED" } });
    expect(r.rail.cards.map((c) => c.state)).toEqual(["VOIDED"]);
    expect((await r.orchestrator.snapshot()).packet).toMatchObject({ status: "REVOKED", committed_minor: 0, spent_minor: 0 });
    await expectVerifies(r);
  });
});

describe("T-S5 escalation expires unanswered (R11)", () => {
  it("tick after the window [F31] logs DENY R11.expired resolving the ESCALATE; a late answer cannot mint", async () => {
    const r = await sealed();
    const esc = await submit(r, P_A1, { ...TEE, scameter_ref: null });
    r.clock.advance(ENGINE_CONFIG.escalation.window_ms);
    expect(await r.orchestrator.tick()).toMatchObject({ ok: true, expiredEscalations: [esc.decision.id] });
    expect(await r.orchestrator.answerEscalation(r.answer(esc.decision.id, "APPROVE"))).toMatchObject({ ok: false, code: "ESCALATION_CLOSED" });
    expect((await r.orchestrator.snapshot()).escalations).toEqual([expect.objectContaining({ decisionId: esc.decision.id, state: "EXPIRED" })]);
    expect(r.rail.cards).toEqual([]);
    await expectVerifies(r);
  });
});

describe("T-S6 velocity burst and expired mandate (R7, R2)", () => {
  it("more than the allowed mints in the window [F32] is DENY R7.velocity", async () => {
    const r = await sealed();
    for (let i = 0; i < ENGINE_CONFIG.velocity.max_mints; i += 1) {
      const minted = await submit(r, P_A4, SOCKS);
      expect(minted.outcome).toBe("APPROVE");
      expect(await r.orchestrator.checkout({ cardId: minted.card?.id ?? "" })).toMatchObject({ status: "AUTHORISED" }); // frees the slot (R8)
      r.clock.advance(60_000);
    }
    expect(await submit(r, P_A4, SOCKS)).toMatchObject({ outcome: "DENY", card: null, decision: { explanation: { template_id: "R7.velocity" } } });
    await expectVerifies(r);
  });

  it("past validUntil: PACKET_EXPIRED once, ACTIVE cards expire, later carts are DENY R2.expired", async () => {
    const until = "2026-10-03T02:20:00Z";
    const r = await sealed("honest", until);
    const a1 = await submit(r, P_A1, TEE);
    expect(a1.card?.expires_at).toBe(new Date(until).toISOString()); // TTL [F30] clamped to the packet expiry by the rail
    r.clock.set(until);
    expect(await r.orchestrator.tick()).toMatchObject({ ok: true, packetExpired: true, expiredCardIds: [a1.card?.id] });
    expect(await submit(r, P_A4, SOCKS)).toMatchObject({ outcome: "DENY", card: null, decision: { explanation: { template_id: "R2.expired" } } });
    expect((await r.kinds()).filter((k) => k === "PACKET_EXPIRED")).toHaveLength(1);
    await expectVerifies(r);
  });
});

describe("DM2 retry beat: a lost response is retried with the same key and charges once", () => {
  it("timeout mode: the executor retries, the rail charges once, one CARD_EVENT is logged", async () => {
    const r = await sealed("timeout");
    const a1 = await submit(r, P_A1, TEE);
    const result = await r.orchestrator.checkout({ cardId: a1.card?.id ?? "" });
    expect(result).toMatchObject({ ok: true, status: "AUTHORISED", attempts: 2 });
    expect(r.rail.authorisations()).toHaveLength(1);
    expect((await r.kinds()).filter((k) => k === "CARD_EVENT")).toHaveLength(1);
    await expectVerifies(r);
  });

  it("drift mode: R12 DENY logged before the VOIDED event; nothing charged", async () => {
    const r = await sealed("drift");
    const a1 = await submit(r, P_A1, TEE);
    const result = await r.orchestrator.checkout({ cardId: a1.card?.id ?? "" });
    expect(result).toMatchObject({ ok: true, status: "DRIFT", voided: true, decision: { explanation: { template_id: "R12.price_drift" } } });
    expect((await r.kinds()).slice(-2)).toEqual(["DECISION", "CARD_EVENT"]);
    expect(r.rail.authorisations()).toEqual([]);
    await expectVerifies(r);
  });

  it("wrong_merchant mode: the merchant lock declines MERCHANT_MISMATCH (SIMULATED)", async () => {
    const r = await sealed("wrong_merchant");
    const a1 = await submit(r, P_A1, TEE);
    expect(await r.orchestrator.checkout({ cardId: a1.card?.id ?? "" })).toMatchObject({ status: "DECLINED", event: { decline_code: "MERCHANT_MISMATCH" } });
    await expectVerifies(r);
  });
});
