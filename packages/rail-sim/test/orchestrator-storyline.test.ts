// The demo storyline end to end (docs/06, DM1-DM7) on RailSim + MerchantStub + FileLogStore, all SIMULATED:
// seal HK$800 [F20]; attempt 1 mints HK$259 [F21] (overshoot declined, exact charge, replay CARD_USED); flagged
// seller stopped (R9); HK$550 stopped by R3 [F22]; injected listing stopped (R10); attempt 4 mints HK$120 [F23];
// HK$421 left. The exported log verifies offline, and one flipped byte breaks it (T-V1, DM7).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListingRecord, ProposeCartInput } from "@laisee/core/generated";
import type { DecidedResult } from "@laisee/core/orchestrator";
import { HOODIE, INJECTED, JACKET, P_A1, P_A2, P_A3, P_A3B, P_A4, SOCKS, TEE, credential, flipOneByte, integration, type Integration } from "./orchestrator-helpers";

vi.setConfig({ testTimeout: 60_000 }); // explicit: these runs sign, verify and append; slow when the machine is loaded

let open: Integration | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

const submit = async (r: Integration, proposal: ProposeCartInput, listing: ListingRecord, text: string) => {
  r.propose(proposal);
  return r.orchestrator.submit({ requestText: text, listings: [listing] });
};

describe("storyline DM1-DM7 (SIMULATED rail)", () => {
  it("runs the whole demo and the log verifies offline", async () => {
    const r = (open = await integration("overshoot"));
    const sealed = await r.orchestrator.seal(credential(r.keys));
    expect(sealed).toMatchObject({ ok: true, packet: { budget_minor: 80000, remaining_minor: 80000 } }); // DM1, HK$800 [F20]

    r.clock.advance(5 * 60_000);
    const a1 = (await submit(r, P_A1, TEE, "a plain cotton tee")) as DecidedResult;
    expect(a1).toMatchObject({ ok: true, outcome: "APPROVE", card: { limit_minor: 25900, merchant_lock: "demo-apparel.example", simulated: true } }); // [F21]
    const cardId = a1.card?.id ?? "";
    expect((await r.orchestrator.snapshot()).packet).toMatchObject({ remaining_minor: 54100 }); // HK$541 left

    const over = await r.orchestrator.checkout({ cardId }); // DM2 overshoot beat
    expect(over).toMatchObject({ ok: true, status: "DECLINED", event: { decline_code: "OVER_LIMIT" } });
    expect((await r.orchestrator.snapshot()).cards[0]?.state).toBe("ACTIVE"); // limit held
    r.stub.setMode("honest");
    const exact = await r.orchestrator.checkout({ cardId });
    expect(exact).toMatchObject({ ok: true, status: "AUTHORISED", event: { amount_minor: 25900 } });
    const replay = await r.orchestrator.checkout({ cardId });
    expect(replay).toMatchObject({ ok: true, status: "DECLINED", event: { decline_code: "CARD_USED" } }); // blocked replay [F19]

    const twice = await submit(r, P_A1, TEE, "a plain cotton tee"); // a double tap: the same cart again returns the earlier decision
    expect(twice).toMatchObject({ ok: true, outcome: "APPROVE", duplicate: true, decision: { id: a1.decision.id }, card: { id: cardId, state: "USED" } });
    expect(r.rail.cards).toHaveLength(1);

    r.clock.advance(3 * 60_000);
    const a2 = await submit(r, P_A2, HOODIE, "a fleece hoodie");
    expect(a2).toMatchObject({ outcome: "DENY", card: null, decision: { explanation: { template_id: "R9.flagged" } } }); // DM3, S2

    r.clock.advance(4 * 60_000);
    const a3 = await submit(r, P_A3, JACKET, "a denim jacket");
    expect(a3).toMatchObject({ outcome: "DENY", card: null, decision: { cart: { total_minor: 55000 }, explanation: { template_id: "R3.over_remaining" } } }); // DM4, S1 [F22]

    r.clock.advance(2 * 60_000);
    const a3b = await submit(r, P_A3B, INJECTED, "a graphic tee");
    expect(a3b).toMatchObject({ outcome: "DENY", card: null, decision: { explanation: { template_id: "R10.injection" } } }); // DM5, S3

    r.clock.advance(6 * 60_000);
    const a4 = (await submit(r, P_A4, SOCKS, "socks")) as DecidedResult;
    expect(a4).toMatchObject({ outcome: "APPROVE", card: { limit_minor: 12000 } }); // DM6 [F23]
    expect(await r.orchestrator.checkout({ cardId: a4.card?.id ?? "" })).toMatchObject({ status: "AUTHORISED", event: { amount_minor: 12000 } });

    const snap = await r.orchestrator.snapshot();
    expect(snap.packet).toMatchObject({ spent_minor: 37900, committed_minor: 0, remaining_minor: 42100 }); // HK$421 left
    expect(await r.kinds()).toEqual([
      "MANDATE_SEALED",
      "DECISION", "CARD_MINTED", "CARD_EVENT", "CARD_EVENT", "CARD_EVENT",
      "DECISION",
      "DECISION",
      "DECISION",
      "DECISION", "CARD_MINTED", "CARD_EVENT",
    ]);
    expect(r.rail.authorisations().map((e) => e.amount_minor)).toEqual([25900, 12000]); // one charge per card, ever

    const text = await r.logText(); // DM7
    expect(r.verify(text)).toMatchObject({ ok: true, head: snap.head ?? {} });
    expect(r.verify(flipOneByte(text))).toMatchObject({ ok: false });
  });
});
