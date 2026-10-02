// suggestAlternatives ("See cheaper options", lane e-ask): after a DENY by R3 or R4 the planner replans over the same
// request and listings; the pick goes through the normal pipeline, so a hostile or mistaken one is stopped again.
import { describe, expect, it, vi } from "vitest";
import type { Cart } from "../src/generated";
import type { DecidedResult, PlannerFactory } from "../src/orchestrator";
import { rememberStop, MAX_REMEMBERED_STOPS } from "../src/orchestrator/stops";
import type { PlannerContext, PlannerStop } from "../src/ports";
import { FakeJudge, FakePlanner, type FakeRail } from "../src/testing";
import { LISTING_HOODIE, LISTING_JACKET, LISTING_SOCKS, LISTING_TEE, PROPOSAL_A1, PROPOSAL_A2, PROPOSAL_A3, PROPOSAL_A4 } from "./cart-helpers";
import { rig, type Rig } from "./orchestrator-helpers";

vi.setConfig({ testTimeout: 60_000 }); // explicit: these runs sign, verify and append; slow when the machine is loaded

const SHELF = [LISTING_JACKET, LISTING_TEE, LISTING_SOCKS];

async function stopped(r: Rig): Promise<DecidedResult> {
  await r.orchestrator.seal(r.credential);
  r.planners.push(PROPOSAL_A1, PROPOSAL_A3);
  await r.orchestrator.submit({ requestText: "a tee", listings: [LISTING_TEE] }); // HK$259 held, HK$541 left
  const result = await r.orchestrator.submit({ requestText: "a denim jacket", listings: SHELF });
  expect(result).toMatchObject({ ok: true, outcome: "DENY", decision: { cart: { total_minor: 55000 }, explanation: { template_id: "R3.over_remaining" } } });
  return result as DecidedResult;
}

describe("a cheaper pick after R3", () => {
  it("asks the planner for alternatives over the same request and listings, with what is left, and approves a pick that fits", async () => {
    const r = rig();
    const stop = await stopped(r);
    r.planners.push(PROPOSAL_A4); // socks, HK$120
    const result = await r.orchestrator.suggestAlternatives({ decisionId: stop.decision.id });
    expect(result).toMatchObject({ ok: true, outcome: "APPROVE", alternativeTo: stop.decision.id, card: { limit_minor: 12000 } });
    const asked = r.planners.planners.at(-1);
    expect(asked?.alternativeCalls).toHaveLength(1);
    expect(asked?.alternativeCalls[0]?.stop).toEqual<PlannerStop>({ templateId: "R3.over_remaining", remainingMinor: 54100 });
    expect(asked?.alternativeCalls[0]?.ctx).toEqual<PlannerContext>({ intentText: "a denim jacket", listings: SHELF.map((l) => ({ url: l.url, text: "" })) });
    expect(asked?.calls).toEqual([]); // propose was not called
    expect(await r.kinds()).toEqual(["MANDATE_SEALED", "DECISION", "CARD_MINTED", "DECISION", "DECISION", "CARD_MINTED"]);
  });

  it("a request text given with the call replaces the remembered one", async () => {
    const r = rig();
    const stop = await stopped(r);
    r.planners.push(PROPOSAL_A4);
    await r.orchestrator.suggestAlternatives({ decisionId: stop.decision.id, requestText: "something cheaper, like socks" });
    expect(r.planners.planners.at(-1)?.alternativeCalls[0]?.ctx.intentText).toBe("something cheaper, like socks");
  });

  it("emits one run of the operation alternatives, ending in the decision of the pick", async () => {
    const r = rig();
    const stop = await stopped(r);
    r.planners.push(PROPOSAL_A4);
    r.events.length = 0;
    await r.orchestrator.suggestAlternatives({ decisionId: stop.decision.id, runId: "run_cheaper1" });
    expect(r.events[0]).toMatchObject({ type: "run.started", runId: "run_cheaper1", operation: "alternatives" });
    expect(r.events.at(-1)).toMatchObject({ type: "run.finished", runId: "run_cheaper1", operation: "alternatives", outcome: "APPROVE" });
    expect(r.events.some((e) => e.type === "cart")).toBe(true);
  });

  it("nothing fits: the planner returns none, so NO_PROPOSAL / no_alternative and nothing is decided", async () => {
    const r = rig();
    const stop = await stopped(r);
    const kinds = await r.kinds();
    r.planners.push(null);
    const result = await r.orchestrator.suggestAlternatives({ decisionId: stop.decision.id });
    expect(result).toMatchObject({ ok: true, outcome: "NO_PROPOSAL", reason: "no_alternative", alternativeTo: stop.decision.id });
    expect(await r.kinds()).toEqual(kinds);
    expect(r.events.at(-1)).toMatchObject({ type: "run.finished", outcome: "INFO", code: "NO_PROPOSAL:no_alternative" });
    expect((r.rail as FakeRail).cards).toHaveLength(1);
  });

  it("a planner without alternatives is no_alternative too", async () => {
    let calls = 0;
    const script = [PROPOSAL_A1, PROPOSAL_A3];
    const plain: PlannerFactory = () => new FakePlanner([script[(calls += 1) - 1] ?? null]); // propose only, no alternatives method
    const r = rig({ planner: plain });
    await r.orchestrator.seal(r.credential);
    await r.orchestrator.submit({ requestText: "a tee", listings: [LISTING_TEE] });
    const stop = (await r.orchestrator.submit({ requestText: "a jacket", listings: SHELF })) as DecidedResult;
    expect(stop).toMatchObject({ outcome: "DENY", decision: { explanation: { template_id: "R3.over_remaining" } } });
    const kinds = await r.kinds();
    expect(await r.orchestrator.suggestAlternatives({ decisionId: stop.decision.id })).toMatchObject({ ok: true, outcome: "NO_PROPOSAL", reason: "no_alternative", alternativeTo: stop.decision.id });
    expect(await r.kinds()).toEqual(kinds);
  });

  it("a hostile planner that returns an over-budget pick is stopped again by R3, with its own decision", async () => {
    const r = rig();
    const stop = await stopped(r);
    r.planners.push(PROPOSAL_A3); // the jacket again, HK$550 against HK$541
    const result = (await r.orchestrator.suggestAlternatives({ decisionId: stop.decision.id })) as DecidedResult;
    expect(result).toMatchObject({ ok: true, outcome: "DENY", card: null, alternativeTo: stop.decision.id, decision: { explanation: { template_id: "R3.over_remaining" } } });
    expect(result.decision.id).not.toBe(stop.decision.id);
    expect((r.rail as FakeRail).cards).toHaveLength(1); // only the tee
    // the new stop can be replanned in turn: the request and listings were remembered for it too
    r.planners.push(PROPOSAL_A4);
    expect(await r.orchestrator.suggestAlternatives({ decisionId: result.decision.id })).toMatchObject({ outcome: "APPROVE", alternativeTo: result.decision.id });
  });

  it("an alternative that repeats a live cart returns that decision (duplicate) and still says what it was for", async () => {
    const r = rig();
    const stop = await stopped(r);
    r.planners.push(PROPOSAL_A1); // the tee again: bought a moment ago
    const result = await r.orchestrator.suggestAlternatives({ decisionId: stop.decision.id });
    expect(result).toMatchObject({ ok: true, outcome: "APPROVE", duplicate: true, alternativeTo: stop.decision.id });
    expect((r.rail as FakeRail).cards).toHaveLength(1);
  });

  it("goes through the judge like any cart: a flagged seller's pick is stopped by R9, never minted (I3)", async () => {
    const judge = new FakeJudge();
    const r = rig({ judge });
    const stop = await stopped(r);
    r.planners.push(PROPOSAL_A2); // the flagged-seller hoodie
    const calls = judge.calls.length;
    const result = await r.orchestrator.suggestAlternatives({ decisionId: stop.decision.id, listings: [LISTING_JACKET, LISTING_HOODIE] });
    expect(result).toMatchObject({ ok: true, outcome: "DENY", card: null, alternativeTo: stop.decision.id, decision: { explanation: { template_id: "R9.flagged" } } });
    expect(judge.calls.length).toBe(calls + 1);
  });
});

describe("not applicable", () => {
  it("an unknown decision, an APPROVE, an escalation and a DENY by another rule", async () => {
    const r = rig();
    await r.orchestrator.seal(r.credential);
    r.planners.push(PROPOSAL_A1, PROPOSAL_A1, PROPOSAL_A2);
    const approve = (await r.orchestrator.submit({ requestText: "a tee", listings: [LISTING_TEE] })) as DecidedResult;
    const escalate = (await r.orchestrator.submit({ requestText: "a tee", listings: [{ ...LISTING_TEE, scameter_ref: null }] })) as DecidedResult;
    const flagged = (await r.orchestrator.submit({ requestText: "a hoodie", listings: [LISTING_HOODIE] })) as DecidedResult;
    expect([approve.outcome, escalate.outcome, flagged.outcome]).toEqual(["APPROVE", "ESCALATE", "DENY"]);
    const kinds = await r.kinds();
    for (const decisionId of ["dec_doesNotExist01", approve.decision.id, escalate.decision.id, flagged.decision.id]) {
      expect(await r.orchestrator.suggestAlternatives({ decisionId })).toMatchObject({ ok: false, code: "NOT_APPLICABLE" });
    }
    expect(await r.kinds()).toEqual(kinds);
  });

  it("before the seal, and without a decision id", async () => {
    const r = rig();
    expect(await r.orchestrator.suggestAlternatives({ decisionId: "dec_whatever01" })).toMatchObject({ ok: false, code: "NOT_SEALED" });
    await r.orchestrator.seal(r.credential);
    expect(await r.orchestrator.suggestAlternatives({} as never)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await r.orchestrator.suggestAlternatives(null as never)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
  });

  it("listings and text sent with the call are checked like a submit's: an invalid record or an empty text is INVALID_REQUEST", async () => {
    const r = rig();
    const stop = await stopped(r);
    const kinds = await r.kinds();
    const bad = [
      { decisionId: stop.decision.id, listings: [{ ...LISTING_TEE, shipping_minor: -5 }] },
      { decisionId: stop.decision.id, listings: [] },
      { decisionId: stop.decision.id, requestText: "   " },
    ];
    for (const request of bad) expect(await r.orchestrator.suggestAlternatives(request)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await r.kinds()).toEqual(kinds);
  });
});

describe("what is remembered", () => {
  it("keeps the newest MAX_REMEMBERED_STOPS stops and only for a DENY by R3 or R4", () => {
    const ctx = { memory: { stops: new Map() } } as unknown as Parameters<typeof rememberStop>[0];
    const cart = { total_minor: 1 } as Cart;
    const denial = (n: number, template: string) => ({ ok: true, runId: "run_x", outcome: "DENY", decision: { id: `dec_${n}`, outcome: "DENY", cart, explanation: { template_id: template } }, card: null, escalation: null, checkout: null }) as unknown as DecidedResult;
    for (let n = 0; n < MAX_REMEMBERED_STOPS + 5; n += 1) rememberStop(ctx, denial(n, "R3.over_remaining"), { requestText: "x", listings: [] });
    rememberStop(ctx, denial(999, "R9.flagged"), { requestText: "x", listings: [] });
    rememberStop(ctx, { ...denial(1000, "R4.over_cap"), duplicate: true }, { requestText: "x", listings: [] });
    const kept = [...ctx.memory.stops.keys()];
    expect(kept).toHaveLength(MAX_REMEMBERED_STOPS);
    expect(kept[0]).toBe("dec_5");
    expect(kept.at(-1)).toBe(`dec_${MAX_REMEMBERED_STOPS + 4}`);
  });
});
