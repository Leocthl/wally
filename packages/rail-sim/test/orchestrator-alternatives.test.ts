// "See cheaper options" (lane e-ask) through the real orchestrator, engine, signed FileLogStore and RailSim + MerchantStub
// (all SIMULATED): HK$550 stopped by R3 at HK$541 left [F22]; a pick that fits is approved and paid; nothing fitting is
// no_alternative; a planner that offers the over-budget item again is stopped again by R3. Every log verifies offline.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DecidedResult } from "@wally/core/orchestrator";
import { JACKET, P_A1, P_A3, P_A4, SOCKS, TEE, credential, flipOneByte, integration, type Integration } from "./orchestrator-helpers";

vi.setConfig({ testTimeout: 60_000 }); // explicit: these runs sign, verify and append; slow when the machine is loaded

let open: Integration | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

const SHELF = [JACKET, TEE, SOCKS];

async function stoppedByR3(): Promise<{ r: Integration; stop: DecidedResult }> {
  const r = (open = await integration());
  expect(await r.orchestrator.seal(credential(r.keys))).toMatchObject({ ok: true });
  r.propose(P_A1);
  expect(await r.orchestrator.submit({ requestText: "a plain cotton tee", listings: [TEE] })).toMatchObject({ outcome: "APPROVE", card: { limit_minor: 25900 } });
  r.propose(P_A3);
  const stop = (await r.orchestrator.submit({ requestText: "a denim jacket", listings: SHELF })) as DecidedResult;
  expect(stop).toMatchObject({ outcome: "DENY", card: null, decision: { cart: { total_minor: 55000 }, explanation: { template_id: "R3.over_remaining", inputs: { remaining_minor: 54100 } } } }); // [F22]
  return { r, stop };
}

async function expectVerifies(r: Integration): Promise<void> {
  const text = await r.logText();
  expect(r.verify(text)).toMatchObject({ ok: true });
  expect(r.verify(flipOneByte(text))).toMatchObject({ ok: false });
}

describe("suggestAlternatives on the real stack (SIMULATED rail)", () => {
  it("an alternative that fits HK$541 is approved, minted for its exact total and paid once", async () => {
    const { r, stop } = await stoppedByR3();
    r.propose(P_A4); // ankle socks, HK$120
    const result = (await r.orchestrator.suggestAlternatives({ decisionId: stop.decision.id, checkout: "auto" })) as DecidedResult;
    expect(result).toMatchObject({ ok: true, outcome: "APPROVE", alternativeTo: stop.decision.id, card: { limit_minor: 12000, simulated: true }, checkout: { ok: true, status: "AUTHORISED", event: { amount_minor: 12000 } } });
    expect(r.rail.cards.map((c) => c.limit_minor)).toEqual([25900, 12000]);
    expect(r.rail.authorisations().map((e) => e.amount_minor)).toEqual([12000]);
    expect((await r.orchestrator.snapshot()).packet).toMatchObject({ spent_minor: 12000, committed_minor: 25900, remaining_minor: 42100 });
    await expectVerifies(r);
  });

  it("nothing fits: no_alternative, no decision, no card", async () => {
    const { r, stop } = await stoppedByR3();
    const kinds = await r.kinds();
    r.propose(null);
    expect(await r.orchestrator.suggestAlternatives({ decisionId: stop.decision.id })).toMatchObject({ ok: true, outcome: "NO_PROPOSAL", reason: "no_alternative", alternativeTo: stop.decision.id });
    expect(await r.kinds()).toEqual(kinds);
    expect(r.rail.cards).toHaveLength(1);
    await expectVerifies(r);
  });

  it("a hostile planner that offers the HK$550 jacket again is stopped again by R3, and mints nothing", async () => {
    const { r, stop } = await stoppedByR3();
    r.propose(P_A3);
    const again = (await r.orchestrator.suggestAlternatives({ decisionId: stop.decision.id })) as DecidedResult;
    expect(again).toMatchObject({ ok: true, outcome: "DENY", card: null, alternativeTo: stop.decision.id, decision: { explanation: { template_id: "R3.over_remaining" } } });
    expect(again.decision.id).not.toBe(stop.decision.id);
    expect(r.rail.cards).toHaveLength(1);
    expect((await r.kinds()).filter((k) => k === "DECISION")).toHaveLength(3);
    await expectVerifies(r);
  });

  it("only a budget stop has cheaper options: the approved tee and a revoked packet are NOT_APPLICABLE", async () => {
    const { r, stop } = await stoppedByR3();
    const approved = (await r.orchestrator.snapshot()).log.flatMap((e) => (e.kind === "DECISION" && e.payload.outcome === "APPROVE" ? [e.payload.id] : []))[0] ?? "";
    expect(await r.orchestrator.suggestAlternatives({ decisionId: approved })).toMatchObject({ ok: false, code: "NOT_APPLICABLE" });
    await r.orchestrator.revoke(r.revocation());
    r.propose(P_A4);
    // revoked: the stop is still an R3 stop, but the pick is decided under R2 and cannot mint (I6)
    expect(await r.orchestrator.suggestAlternatives({ decisionId: stop.decision.id })).toMatchObject({ outcome: "DENY", card: null, decision: { explanation: { template_id: "R2.revoked" } } });
    await expectVerifies(r);
  });
});
