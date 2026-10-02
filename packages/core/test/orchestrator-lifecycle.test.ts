// Escalation answers and R11 expiry (A-23, T-S5), revoke and the revoke race (A-24, T-S4), expiry (A-25, T-S6)
// and repeated checkout on one card, with fakes. The serialised queue orders revoke against mint (I6).
import { describe, expect, it, vi } from "vitest";
import { ENGINE_CONFIG } from "../src/config";
import type { Cart, Decision } from "../src/generated";
import type { DecidedResult } from "../src/orchestrator";
import type { CardEvent, JudgeInput, JudgePort, JudgeRecord, MerchantPort, MerchantQuote, RailPort } from "../src/ports";
import { FakeJudge, FakeMerchant, type FakeRail } from "../src/testing";
import { LISTING_TEE, PROPOSAL_A1 } from "./cart-helpers";
import { deferred, rig, settle, type Rig } from "./orchestrator-helpers";

vi.setConfig({ testTimeout: 60_000 }); // explicit: these runs sign, verify and append; slow when the machine is loaded

const UNCHECKED_TEE = [{ ...LISTING_TEE, scameter_ref: null }]; // NOT_CHECKED => ESCALATE R9.unverified
const TEE = [LISTING_TEE];

async function sealed(options: Parameters<typeof rig>[0] = {}): Promise<Rig> {
  const r = rig(options);
  await r.orchestrator.seal(r.credential);
  return r;
}

async function escalate(r: Rig): Promise<Decision> {
  r.planners.push(PROPOSAL_A1);
  const result = await r.orchestrator.submit({ requestText: "a tee", listings: UNCHECKED_TEE });
  expect(result).toMatchObject({ ok: true, outcome: "ESCALATE", escalation: { state: "OPEN", ruleId: "R9", templateId: "R9.unverified", totalMinor: 25900 } });
  return (result as DecidedResult).decision;
}

async function approved(r: Rig): Promise<DecidedResult> {
  r.planners.push(PROPOSAL_A1);
  const result = await r.orchestrator.submit({ requestText: "a tee", listings: TEE });
  expect(result).toMatchObject({ ok: true, outcome: "APPROVE" });
  return result as DecidedResult;
}

describe("escalation answers (A-23)", () => {
  it("a signed APPROVE inside the window resolves the ESCALATE and mints", async () => {
    const r = await sealed();
    const esc = await escalate(r);
    r.clock.advance(10_000);
    const result = await r.orchestrator.answerEscalation(r.answer(esc.id, "APPROVE"));
    expect(result).toMatchObject({ ok: true, outcome: "APPROVE", decision: { resolves: esc.id, escalation: { state: "APPROVED" } }, card: { limit_minor: 25900 } });
    expect(result).toMatchObject({ escalation: { decisionId: esc.id, state: "APPROVED" } });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED", "DECISION", "DECISION", "CARD_MINTED"]);
    expect((await r.orchestrator.snapshot()).escalations).toEqual([expect.objectContaining({ decisionId: esc.id, state: "APPROVED" })]);
  });

  it("a signed DENY resolves it as DENIED and mints nothing", async () => {
    const r = await sealed();
    const esc = await escalate(r);
    const result = await r.orchestrator.answerEscalation(r.answer(esc.id, "DENY"));
    expect(result).toMatchObject({ ok: true, outcome: "DENY", card: null, escalation: { state: "DENIED" } });
  });

  it("an answer signed by anyone but the pinned delegator is refused before decide; a tampered answer too", async () => {
    const r = await sealed();
    const esc = await escalate(r);
    const { signEscalationAnswer } = await import("../src/log");
    const forged = signEscalationAnswer({ decision_id: esc.id, mandate_id: esc.mandate_id, cart: esc.cart, choice: "APPROVE", answered_at: r.clock.now() }, r.keys.engine);
    expect(await r.orchestrator.answerEscalation(forged)).toMatchObject({ ok: false, code: "INVALID_ANSWER" });
    const tampered = { ...r.answer(esc.id, "DENY"), choice: "APPROVE" as const };
    expect(await r.orchestrator.answerEscalation(tampered)).toMatchObject({ ok: false, code: "INVALID_ANSWER" });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED", "DECISION"]);
    expect((await r.orchestrator.snapshot()).escalations).toEqual([expect.objectContaining({ decisionId: esc.id, state: "OPEN" })]);
  });

  it("malformed, unknown or repeated answers make no Decision", async () => {
    const r = await sealed();
    const esc = await escalate(r);
    expect(await r.orchestrator.answerEscalation({ decision_id: esc.id, choice: "MAYBE" })).toMatchObject({ ok: false, code: "INVALID_ANSWER" });
    expect(await r.orchestrator.answerEscalation(r.answer("dec_noSuchDecision1", "APPROVE"))).toMatchObject({ ok: false, code: "UNKNOWN_ESCALATION" });
    expect(await r.orchestrator.answerEscalation(r.answer("dec_noSuchDecision1", "APPROVE"))).toMatchObject({ ok: false, code: "UNKNOWN_ESCALATION" });
    await r.orchestrator.answerEscalation(r.answer(esc.id, "DENY"));
    expect(await r.orchestrator.answerEscalation(r.answer(esc.id, "APPROVE"))).toMatchObject({ ok: false, code: "ESCALATION_CLOSED" });
    expect((await r.kinds()).filter((k) => k === "DECISION")).toHaveLength(2);
  });
});

describe("tick (A-23, A-25)", () => {
  it("T-S5: an unanswered escalation past its window [F31] is DENY R11.expired resolving it; idle ticks emit nothing", async () => {
    const r = await sealed();
    const esc = await escalate(r);
    r.events.length = 0;
    expect(await r.orchestrator.tick()).toMatchObject({ ok: true, runId: null, expiredEscalations: [] });
    expect(r.events).toEqual([]);
    r.clock.advance(ENGINE_CONFIG.escalation.window_ms);
    const tick = await r.orchestrator.tick();
    expect(tick).toMatchObject({ ok: true, expiredEscalations: [esc.id], packetExpired: false });
    const resolving = (await r.entries()).at(-1);
    expect(resolving?.kind === "DECISION" && resolving.payload).toMatchObject({ outcome: "DENY", resolves: esc.id, escalation: { state: "EXPIRED" }, explanation: { template_id: "R11.expired" } });
    expect(r.events.find((e) => e.type === "escalation")).toMatchObject({ escalation: { decisionId: esc.id, state: "EXPIRED" } });
    expect(await r.orchestrator.answerEscalation(r.answer(esc.id, "APPROVE"))).toMatchObject({ ok: false, code: "ESCALATION_CLOSED" });
  });

  it("expires a card past its TTL [F30] (CARD_EVENT EXPIRED, limit released)", async () => {
    const r = await sealed();
    const { card } = await approved(r);
    r.clock.advance(ENGINE_CONFIG.card.ttl_ms);
    expect(await r.orchestrator.tick()).toMatchObject({ ok: true, expiredCardIds: [card?.id] });
    expect((await r.orchestrator.snapshot()).packet).toMatchObject({ committed_minor: 0, remaining_minor: 80000 });
    expect((await r.orchestrator.snapshot()).cards[0]?.state).toBe("EXPIRED");
  });

  it("T-S6: PACKET_EXPIRED once when validUntil passes; later carts are DENY R2.expired", async () => {
    const r = await sealed();
    r.clock.set(r.credential.validUntil);
    expect(await r.orchestrator.tick()).toMatchObject({ ok: true, packetExpired: true });
    expect(await r.orchestrator.tick()).toMatchObject({ runId: null, packetExpired: false });
    expect((await r.kinds()).filter((k) => k === "PACKET_EXPIRED")).toHaveLength(1);
    r.planners.push(PROPOSAL_A1);
    const late = await r.orchestrator.submit({ requestText: "a tee", listings: TEE });
    expect(late).toMatchObject({ ok: true, outcome: "DENY", card: null, decision: { explanation: { template_id: "R2.expired" } } });
  });
});

describe("revoke (A-24, T-S4)", () => {
  it("appends MANDATE_REVOKED, voids every ACTIVE card, and every later cart is DENY R2.revoked", async () => {
    const r = await sealed();
    const { card } = await approved(r);
    const result = await r.orchestrator.revoke(r.revocation());
    expect(result).toMatchObject({ ok: true, voidedCardIds: [card?.id], failedCardIds: [], alreadyRevoked: false });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED", "DECISION", "CARD_MINTED", "MANDATE_REVOKED", "CARD_EVENT"]);
    expect(r.events.find((e) => e.type === "mandate.revoked")).toMatchObject({ voidedCardIds: [card?.id] });
    r.planners.push(PROPOSAL_A1);
    expect(await r.orchestrator.submit({ requestText: "a tee", listings: TEE })).toMatchObject({ outcome: "DENY", card: null, decision: { explanation: { template_id: "R2.revoked" } } });
    expect(await r.orchestrator.revoke(r.revocation())).toMatchObject({ ok: true, alreadyRevoked: true, voidedCardIds: [] });
    expect((await r.kinds()).filter((k) => k === "MANDATE_REVOKED")).toHaveLength(1);
  });

  it("refuses a revocation not signed by the delegator, or for another mandate, without logging", async () => {
    const r = await sealed();
    const { signRevocation } = await import("../src/log");
    const forged = signRevocation({ mandate_id: "mnd_demoM0", revoked_at: r.clock.now() }, r.keys.engine);
    expect(await r.orchestrator.revoke(forged)).toMatchObject({ ok: false, code: "INVALID_REVOCATION" });
    const other = signRevocation({ mandate_id: "mnd_otherMandate", revoked_at: r.clock.now() }, r.keys.delegator);
    expect(await r.orchestrator.revoke(other)).toMatchObject({ ok: false, code: "INVALID_REVOCATION" });
    expect(await r.orchestrator.revoke({ nonsense: true })).toMatchObject({ ok: false, code: "INVALID_REVOCATION" });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED"]);
  });

  it("a revoke queued behind a submit waits for its mint, then voids the card", async () => {
    const gate = deferred<void>();
    const inner = new FakeJudge();
    const slowJudge: JudgePort = { provider: "laya", assess: async (input: JudgeInput, opts) => { await gate.promise; return inner.assess(input, opts); } };
    const r = await sealed({ judge: slowJudge, config: { judgeTimeoutMs: 5_000 } });
    r.planners.push(PROPOSAL_A1);
    const submit = r.orchestrator.submit({ requestText: "a tee", listings: TEE });
    await settle(); // the submit is now in the queue, waiting for the judge
    const revoke = r.orchestrator.revoke(r.revocation());
    await settle();
    expect(await r.kinds()).toEqual(["MANDATE_SEALED"]);
    gate.resolve();
    const [s, v] = await Promise.all([submit, revoke]);
    expect(s).toMatchObject({ ok: true, outcome: "APPROVE" });
    expect(v).toMatchObject({ ok: true, voidedCardIds: [(s as DecidedResult).card?.id] });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED", "DECISION", "CARD_MINTED", "MANDATE_REVOKED", "CARD_EVENT"]);
  });

  it("a submit that reaches the queue after a revoke is DENY R2.revoked (I6)", async () => {
    const r = await sealed();
    r.planners.push(PROPOSAL_A1);
    const [v, s] = await Promise.all([r.orchestrator.revoke(r.revocation()), r.orchestrator.submit({ requestText: "a tee", listings: TEE })]);
    expect(v).toMatchObject({ ok: true });
    expect(s).toMatchObject({ ok: true, outcome: "DENY", card: null, decision: { explanation: { template_id: "R2.revoked" } } });
  });
});

describe("checkout (executor, R12)", () => {
  it("is callable repeatedly on one card: the exact charge, then the replay declined CARD_USED", async () => {
    const r = await sealed();
    const { card } = await approved(r);
    const first = await r.orchestrator.checkout({ cardId: card?.id ?? "" });
    expect(first).toMatchObject({ ok: true, status: "AUTHORISED", event: { amount_minor: 25900 } });
    const replay = await r.orchestrator.checkout({ cardId: card?.id ?? "" });
    expect(replay).toMatchObject({ ok: true, status: "DECLINED", event: { decline_code: "CARD_USED" } });
    expect(r.events.filter((e) => e.type === "card.event").map((e) => e.type === "card.event" && e.cause)).toEqual(["checkout", "checkout"]);
    expect((await r.orchestrator.snapshot()).packet).toMatchObject({ spent_minor: 25900, remaining_minor: 54100 });
  });

  it("an unknown card is UNKNOWN_CARD", async () => {
    const r = await sealed();
    expect(await r.orchestrator.checkout({ cardId: "crd_noSuchCard01" })).toMatchObject({ ok: false, code: "UNKNOWN_CARD" });
  });

  it("drift: the R12 DENY is logged before the void; the card is voided and nothing is charged", async () => {
    const drifting = (rail: RailPort): MerchantPort => {
      const honest = new FakeMerchant(rail);
      return {
        quote: async ({ cart }: { cart: Cart; now: Date }): Promise<MerchantQuote> => ({ ...(await honest.quote({ cart, now: new Date() })), shipping_minor: 2000, total_minor: cart.total_minor + 2000 }),
        checkout: (input): Promise<CardEvent> => honest.checkout(input),
      };
    };
    const r = await sealed({ merchant: drifting });
    const { card, decision } = await approved(r);
    const result = await r.orchestrator.checkout({ cardId: card?.id ?? "" });
    expect(result).toMatchObject({ ok: true, status: "DRIFT", voided: true, approvedTotalMinor: 25900, quotedTotalMinor: 27900, decision: { outcome: "DENY", resolves: decision.id, explanation: { template_id: "R12.price_drift" } } });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED", "DECISION", "CARD_MINTED", "DECISION", "CARD_EVENT"]);
    expect((r.rail as FakeRail).cards.map((c) => c.state)).toEqual(["VOIDED"]);
    expect((await r.orchestrator.snapshot()).packet).toMatchObject({ committed_minor: 0, spent_minor: 0 });
  });

  it("a merchant that always times out is TIMEOUT with the key to retry; nothing is logged", async () => {
    const timingOut = (): MerchantPort => ({
      quote: async ({ cart }) => ({ total_minor: cart.total_minor, subtotal_minor: cart.subtotal_minor, shipping_minor: cart.shipping_minor, fees_minor: cart.fees_minor, fx_minor: 0 }),
      checkout: async () => {
        throw Object.assign(new Error("lost"), { code: "SIMULATED_TIMEOUT" });
      },
    });
    const r = await sealed({ merchant: timingOut });
    const { card } = await approved(r);
    const result = await r.orchestrator.checkout({ cardId: card?.id ?? "" });
    expect(result).toMatchObject({ ok: true, status: "TIMEOUT", idempotencyKey: `chk:${card?.id}:1` });
    expect(await r.kinds()).toEqual(["MANDATE_SEALED", "DECISION", "CARD_MINTED"]);
  });
});

describe("judge record handling", () => {
  it("passes the mandate intent, rules, cart, listing text and Scameter state to the judge", async () => {
    const seen: JudgeInput[] = [];
    const judge: JudgePort = { provider: "laya", assess: async (input: JudgeInput, opts): Promise<JudgeRecord> => { seen.push(input); return new FakeJudge().assess(input, opts); } };
    const r = await sealed({ judge });
    await approved(r);
    expect(seen[0]).toMatchObject({ intentText: r.credential.credentialSubject.intent_text, rules: r.credential.credentialSubject.rules, listingText: LISTING_TEE.text, scameter: { state: "NO_RECORD" } });
  });
});
