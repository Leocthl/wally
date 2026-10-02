// The audit's rail scenarios (lane s-audit, copied, not edited) run through the orchestrator on RailSim (SIMULATED):
// A2-05 an under-reporting merchant cannot free budget (the rail's own record wins), A2-04 two approvals cannot
// over-commit the packet, A2-06 the merchant lock is the approved merchant. Each log still verifies offline.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListingRecord, ProposeCartInput } from "@laisee/core/generated";
import type { DecidedResult } from "@laisee/core/orchestrator";
import type { CardEvent } from "@laisee/core/ports";
import { P_A1, P_A4, SOCKS, TEE, credential, integration, type Integration } from "./orchestrator-helpers";

vi.setConfig({ testTimeout: 60_000 }); // explicit: these runs sign, verify and append; slow when the machine is loaded

let open: Integration | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

const priced = (listing: ListingRecord, unitMinor: number): ListingRecord => ({ ...listing, items: [{ ...listing.items[0], unit_price_minor: unitMinor }] }) as ListingRecord;

async function buy(r: Integration, proposal: ProposeCartInput, listing: ListingRecord): Promise<DecidedResult> {
  r.propose(proposal);
  return (await r.orchestrator.submit({ requestText: "shopper request", listings: [listing] })) as DecidedResult;
}

// Changed (lane s-fix-core, H5 moved into the executor): the charge did land at the rail, so the truthful log entry is
// the rail's own event (HK$600), with the merchant's 1-cent claim flagged MERCHANT_REPORT_MISMATCH. Before, the
// orchestrator's attestMerchant refused the claim and logged nothing, which hid a real charge from the log (it kept
// the limit committed, so the budget held either way).
describe("A2-05: an under-reporting merchant cannot free budget (H5)", () => {
  it("the rail's own HK$600 is logged, the 1-cent claim is flagged, and the next cart cannot overspend", async () => {
    let lie = true;
    const r = (open = await integration("honest", (stub) => ({
      quote: (i) => stub.quote(i),
      checkout: async (i): Promise<CardEvent> => {
        const real = await stub.checkout(i);
        return lie && real.event === "AUTHORISED" ? { ...real, amount_minor: 1 } : real;
      },
    })));
    expect(await r.orchestrator.seal(credential(r.keys))).toMatchObject({ ok: true });
    const first = await buy(r, P_A1, priced(TEE, 60_000));
    expect(first).toMatchObject({ outcome: "APPROVE" });
    expect(await r.orchestrator.checkout({ cardId: first.card?.id ?? "" })).toMatchObject({
      ok: true,
      status: "AUTHORISED",
      event: { amount_minor: 60_000 },
      anomalies: ["MERCHANT_REPORT_MISMATCH"],
    });
    expect((await r.kinds()).filter((k) => k === "CARD_EVENT")).toEqual(["CARD_EVENT"]);
    expect((await r.orchestrator.snapshot()).packet).toMatchObject({ committed_minor: 0, spent_minor: 60_000, remaining_minor: 20_000 });
    lie = false;
    const second = await buy(r, P_A4, priced(SOCKS, 70_000));
    expect(second).toMatchObject({ outcome: "DENY", decision: { explanation: { template_id: "R3.over_remaining" } } });
    const railSpent = r.rail.authorisations().reduce((n, e) => n + (e.amount_minor ?? 0), 0);
    expect(railSpent).toBeLessThanOrEqual(80_000);
    expect(r.verify(await r.logText())).toMatchObject({ ok: true });
  });
});

describe("A2-04: approvals cannot over-commit the packet", () => {
  it("two HK$500 carts against HK$800 at once: one mint, one DENY R3; committed + spent <= budget", async () => {
    const r = (open = await integration());
    await r.orchestrator.seal(credential(r.keys));
    r.propose(P_A1, P_A1);
    const listing = priced(TEE, 50_000);
    // allowRepeat: the same cart twice is otherwise one decision (orchestrator-idempotent.test.ts); here both must be decided
    const results = (await Promise.all([
      r.orchestrator.submit({ requestText: "a", listings: [listing], allowRepeat: true }),
      r.orchestrator.submit({ requestText: "b", listings: [listing], allowRepeat: true }),
    ])) as DecidedResult[];
    expect(results.map((x) => x.outcome).sort()).toEqual(["APPROVE", "DENY"]);
    expect(r.rail.cards).toHaveLength(1);
    const p = (await r.orchestrator.snapshot()).packet;
    expect((p?.committed_minor ?? 0) + (p?.spent_minor ?? 0)).toBeLessThanOrEqual(p?.budget_minor ?? 0);
    expect(r.verify(await r.logText())).toMatchObject({ ok: true });
  });
});

describe("A2-06: the merchant lock is the approved cart's merchant", () => {
  it("the minted card is locked to the approved domain, and a charge from another domain is declined", async () => {
    const r = (open = await integration("wrong_merchant"));
    await r.orchestrator.seal(credential(r.keys));
    const minted = await buy(r, P_A1, TEE);
    expect(r.rail.card(minted.card?.id ?? "")?.merchant_lock).toBe(minted.decision.cart.merchant.domain);
    expect(await r.orchestrator.checkout({ cardId: minted.card?.id ?? "" })).toMatchObject({ status: "DECLINED", event: { decline_code: "MERCHANT_MISMATCH" } });
  });
});
