// Idempotent submit (docs/02 section 6, lane e-ask): a cart that repeats a live one gets the earlier decision back, with
// no second decision, card, charge or judge call. DENY, a closed escalation and a dead card are decided afresh.
// Fakes for the planner, judge, rail and merchant; the real engine, log and orchestrator.
import { describe, expect, it, vi } from "vitest";
import { ENGINE_CONFIG } from "../src/config";
import type { DecidedResult } from "../src/orchestrator";
import { FakeJudge, type FakeRail } from "../src/testing";
import { LISTING_JACKET, LISTING_TEE, PROPOSAL_A1, PROPOSAL_A3 } from "./cart-helpers";
import { rig, type Rig } from "./orchestrator-helpers";

vi.setConfig({ testTimeout: 60_000 }); // explicit: these runs sign, verify and append; slow when the machine is loaded

const TEE = [LISTING_TEE];
const UNCHECKED_TEE = [{ ...LISTING_TEE, scameter_ref: null }]; // NOT_CHECKED => ESCALATE R9.unverified
const decisionCount = async (r: Rig): Promise<number> => (await r.kinds()).filter((k) => k === "DECISION").length;

async function sealed(options: Parameters<typeof rig>[0] = {}): Promise<Rig> {
  const r = rig(options);
  await r.orchestrator.seal(r.credential);
  return r;
}

async function buy(r: Rig, listings = TEE, extra: { checkout?: "auto" | "none"; allowRepeat?: boolean } = {}): Promise<DecidedResult> {
  const result = await r.orchestrator.submit({ requestText: "a plain cotton tee", listings, ...extra });
  expect(result.ok).toBe(true);
  return result as DecidedResult;
}

describe("the same cart twice", () => {
  it("returns the earlier decision and card: one decision, one card, no second judge call", async () => {
    const judge = new FakeJudge();
    const r = await sealed({ judge });
    r.planners.push(PROPOSAL_A1, PROPOSAL_A1);
    const first = await buy(r);
    const kinds = await r.kinds();
    const second = await buy(r);
    expect(first.duplicate).toBeUndefined();
    expect(second).toMatchObject({ ok: true, outcome: "APPROVE", duplicate: true, checkout: null, escalation: null });
    expect(second.decision).toEqual(first.decision);
    expect(second.card).toEqual(first.card);
    expect(second.runId).not.toBe(first.runId);
    expect(await r.kinds()).toEqual(kinds); // nothing appended
    expect(judge.calls).toHaveLength(1);
    expect((r.rail as FakeRail).cards).toHaveLength(1);
    expect((await r.orchestrator.snapshot()).packet).toMatchObject({ committed_minor: 25900, remaining_minor: 54100 }); // held once
  });

  it("also after the purchase: a repeat of a paid cart is not charged again (checkout auto)", async () => {
    const r = await sealed();
    r.planners.push(PROPOSAL_A1, PROPOSAL_A1);
    const first = await buy(r, TEE, { checkout: "auto" });
    expect(first.checkout).toMatchObject({ ok: true, status: "AUTHORISED" });
    const kinds = await r.kinds();
    const second = await buy(r, TEE, { checkout: "auto" });
    expect(second).toMatchObject({ duplicate: true, outcome: "APPROVE", card: { id: first.card?.id, state: "USED" }, checkout: null });
    expect(await r.kinds()).toEqual(kinds);
    expect((await r.orchestrator.snapshot()).packet).toMatchObject({ spent_minor: 25900, committed_minor: 0 });
  });

  it("two submits at the same time make one decision (the check inside the queue decides)", async () => {
    const r = await sealed();
    r.planners.push(PROPOSAL_A1, PROPOSAL_A1);
    const [a, b] = await Promise.all([buy(r), buy(r)]);
    expect([a.duplicate, b.duplicate].filter((d) => d === true)).toHaveLength(1);
    expect(a.decision.id).toBe(b.decision.id);
    expect(a.card?.id).toBe(b.card?.id);
    expect(await decisionCount(r)).toBe(1);
    expect((r.rail as FakeRail).cards).toHaveLength(1);
  });

  it("a repeat run shows the earlier decision and skips the stages that did not run", async () => {
    const r = await sealed();
    r.planners.push(PROPOSAL_A1, PROPOSAL_A1);
    const first = await buy(r);
    r.events.length = 0;
    await r.orchestrator.submit({ requestText: "a plain cotton tee", listings: TEE, runId: "run_repeat1" });
    const trace = r.events.map((e) => (e.type === "stage" ? `${e.stage}:${e.status}` : e.type));
    expect(trace).toEqual(["run.started", "planner:running", "planner:done", "cart", "judge:skipped", "engine:skipped", "rail:skipped", "decision", "run.finished"]);
    expect(r.events.find((e) => e.type === "decision")).toMatchObject({ runId: "run_repeat1", decision: { id: first.decision.id } });
    expect(r.events.at(-1)).toMatchObject({ type: "run.finished", outcome: "APPROVE", code: "DUPLICATE" });
  });

  it("is decided afresh with allowRepeat (a booth button, a harness burst): two decisions, two cards", async () => {
    const r = await sealed();
    r.planners.push(PROPOSAL_A1, PROPOSAL_A1);
    const first = await buy(r, TEE, { allowRepeat: true });
    const second = await buy(r, TEE, { allowRepeat: true });
    expect(second.duplicate).toBeUndefined();
    expect(second.decision.id).not.toBe(first.decision.id);
    expect((r.rail as FakeRail).cards).toHaveLength(2);
    expect(await decisionCount(r)).toBe(2);
  });

  it("a different cart is not a repeat: two tees are another purchase than one", async () => {
    const r = await sealed();
    r.planners.push(PROPOSAL_A1, { ...PROPOSAL_A1, items: [{ title: PROPOSAL_A1.items[0]?.title ?? "", qty: 2 }] });
    const one = await buy(r);
    const two = await buy(r);
    expect(two.duplicate).toBeUndefined();
    expect(two.decision.cart.total_minor).toBe(2 * one.decision.cart.total_minor - LISTING_TEE.shipping_minor - LISTING_TEE.fees_minor);
    expect(await decisionCount(r)).toBe(2);
  });
});

describe("what is decided again", () => {
  it("a DENY, then budget freed, then the same cart: a new decision", async () => {
    const r = await sealed();
    r.planners.push(PROPOSAL_A1, PROPOSAL_A3, PROPOSAL_A3);
    await buy(r); // HK$259 held, HK$541 left
    const denied = await buy(r, [LISTING_JACKET]); // HK$550 > HK$541
    expect(denied).toMatchObject({ outcome: "DENY", decision: { explanation: { template_id: "R3.over_remaining" } } });
    const again = await buy(r, [LISTING_JACKET]); // same cart, nothing changed: DENY is never a repeat, so it is decided again
    expect(again.duplicate).toBeUndefined();
    expect(again.decision.id).not.toBe(denied.decision.id);
    r.clock.advance(ENGINE_CONFIG.card.ttl_ms); // the tee card expires unused: its HK$259 is free again
    expect(await r.orchestrator.tick()).toMatchObject({ ok: true, expiredCardIds: [expect.any(String)] });
    r.planners.push(PROPOSAL_A3);
    const afterTopUp = await buy(r, [LISTING_JACKET]);
    expect(afterTopUp).toMatchObject({ outcome: "APPROVE", card: { limit_minor: 55000 } });
    expect(afterTopUp.duplicate).toBeUndefined();
    expect(await decisionCount(r)).toBe(4);
  });

  it("an approval whose card expired unused: the same cart is decided afresh and gets a new card", async () => {
    const r = await sealed();
    r.planners.push(PROPOSAL_A1, PROPOSAL_A1);
    const first = await buy(r);
    r.clock.advance(ENGINE_CONFIG.card.ttl_ms);
    await r.orchestrator.tick();
    const second = await buy(r);
    expect(second.duplicate).toBeUndefined();
    expect(second.card?.id).not.toBe(first.card?.id);
    expect(second.card?.state).toBe("ACTIVE");
  });

  it("an approval whose card was voided by a revoke: later carts are DENY R2, never an old card", async () => {
    const r = await sealed();
    r.planners.push(PROPOSAL_A1, PROPOSAL_A1);
    await buy(r);
    await r.orchestrator.revoke(r.revocation());
    expect(await buy(r)).toMatchObject({ outcome: "DENY", decision: { explanation: { template_id: "R2.revoked" } } });
  });
});

describe("an open escalation", () => {
  it("is returned for a repeat; an expired or denied one is asked again", async () => {
    const r = await sealed();
    r.planners.push(PROPOSAL_A1, PROPOSAL_A1, PROPOSAL_A1, PROPOSAL_A1);
    const first = await buy(r, UNCHECKED_TEE);
    expect(first).toMatchObject({ outcome: "ESCALATE", escalation: { state: "OPEN" } });
    const second = await buy(r, UNCHECKED_TEE);
    expect(second).toMatchObject({ outcome: "ESCALATE", duplicate: true, card: null, escalation: { decisionId: first.decision.id, state: "OPEN" } });
    expect(await decisionCount(r)).toBe(1);

    r.clock.advance(ENGINE_CONFIG.escalation.window_ms); // the window ends: even before the tick resolves it, it is not open
    const third = await buy(r, UNCHECKED_TEE);
    expect(third.duplicate).toBeUndefined();
    expect(third.decision.id).not.toBe(first.decision.id);

    await r.orchestrator.answerEscalation(r.answer(third.decision.id, "DENY"));
    const fourth = await buy(r, UNCHECKED_TEE); // answered DENY: asking again is a new escalation
    expect(fourth).toMatchObject({ outcome: "ESCALATE" });
    expect(fourth.duplicate).toBeUndefined();
    expect(fourth.decision.id).not.toBe(third.decision.id);
  });

  it("an escalation approved by the shopper: a repeat returns the approval and its card", async () => {
    const r = await sealed();
    r.planners.push(PROPOSAL_A1, PROPOSAL_A1);
    const asked = await buy(r, UNCHECKED_TEE);
    const answered = (await r.orchestrator.answerEscalation(r.answer(asked.decision.id, "APPROVE"))) as DecidedResult;
    expect(answered).toMatchObject({ outcome: "APPROVE", decision: { resolves: asked.decision.id } });
    const repeat = await buy(r, UNCHECKED_TEE);
    expect(repeat).toMatchObject({ outcome: "APPROVE", duplicate: true, decision: { id: answered.decision.id }, card: { id: answered.card?.id } });
    expect((r.rail as FakeRail).cards).toHaveLength(1);
  });
});
