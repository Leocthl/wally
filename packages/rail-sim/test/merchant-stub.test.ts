// A-22 merchant stub (SIMULATED): honest, overshoot, drift, preauth, timeout, wrong_merchant.
import { SimulatedTimeoutError } from "@laisee/core/executor";
import type { Cart } from "@laisee/core/generated";
import { describe, expect, it } from "vitest";
import { MERCHANT_MODES, MerchantStub, RailSimError, SIMULATED_SURCHARGE_MINOR, type MerchantStubOptions } from "../src";
import { MERCHANT, NOW, cartWithTotal, mintCard, type MintedCard } from "./helpers";

const TOTAL = 25_900;

async function setup(options: Partial<Omit<MerchantStubOptions, "rail">> = {}, mint: { merchantLock?: string } = {}) {
  const minted: MintedCard = await mintCard({}, { totalMinor: TOTAL }, mint);
  const cart: Cart = Object.freeze(cartWithTotal(TOTAL));
  const stub = new MerchantStub({ rail: minted.rail, ...options });
  const checkout = (key: string, handle = minted.card.handle) => stub.checkout({ cart, handle, idempotencyKey: key, now: NOW });
  return { ...minted, cart, stub, checkout };
}

describe("modes and defaults", () => {
  it("lists the six modes of CONTRACT V2", () => {
    expect([...MERCHANT_MODES]).toEqual(["honest", "overshoot", "drift", "preauth", "timeout", "wrong_merchant"]);
  });

  it("defaults to honest and takes the scenario surcharge from the F22 shipping line", () => {
    expect(SIMULATED_SURCHARGE_MINOR).toBe(3_000);
    return setup().then(({ stub }) => expect(stub.mode).toBe("honest"));
  });

  it("rejects an unknown mode or invalid scenario parameters", async () => {
    const { rail } = await mintCard();
    expect(() => new MerchantStub({ rail, mode: "evil" as never })).toThrow(RailSimError);
    expect(() => new MerchantStub({ rail, overshootMinor: 0 })).toThrow(RailSimError);
    expect(() => new MerchantStub({ rail, driftMinor: 0 })).toThrow(RailSimError);
    expect(() => new MerchantStub({ rail, preauthExtraMinor: -1 })).toThrow(RailSimError);
    expect(() => new MerchantStub({ rail, timeoutCount: -1 })).toThrow(RailSimError);
    expect(() => new MerchantStub({ rail, wrongDomain: "NOT A DOMAIN" })).toThrow(RailSimError);
    const { stub } = await setup();
    expect(() => stub.setMode("evil" as never)).toThrow(RailSimError);
  });
});

describe("honest", () => {
  it("quotes the approved breakdown and charges exactly the total", async () => {
    const { stub, cart, checkout, rail, card } = await setup({}, { merchantLock: MERCHANT });
    expect(await stub.quote({ cart, now: NOW })).toEqual({
      total_minor: TOTAL,
      subtotal_minor: TOTAL,
      shipping_minor: 0,
      fees_minor: 0,
      fx_minor: 0,
    });
    expect(await checkout("c1")).toMatchObject({ event: "AUTHORISED", amount_minor: TOTAL, merchant_domain: MERCHANT, card_id: card.id });
    expect(rail.authorisations()).toHaveLength(1);
  });

  it("includes the FX fee in the quote", async () => {
    const { stub, cart } = await setup();
    const fxCart: Cart = {
      ...cart,
      fx: { listed_currency: "USD", listed_amount_minor: 3_000, rate: "7.8", rate_observed_at: NOW.toISOString(), rate_source_ref: "SIM-fx", fee_minor: 470, fee_ref: "F3.fx_settled_hkd" },
      fees_minor: 0,
      total_minor: TOTAL + 470,
    };
    expect(await stub.quote({ cart: fxCart, now: NOW })).toMatchObject({ fx_minor: 470, total_minor: TOTAL + 470 });
  });
});

describe("overshoot: DM2 beat on the live card", () => {
  it("charges above the quote, the rail declines OVER_LIMIT with the limit held, then honest succeeds, then the replay is blocked", async () => {
    const { stub, checkout, rail, card } = await setup({ mode: "overshoot" }, { merchantLock: MERCHANT });
    expect((await stub.quote({ cart: cartWithTotal(TOTAL), now: NOW })).total_minor).toBe(TOTAL);
    const over = await checkout("dm2_over");
    expect(over).toMatchObject({ event: "DECLINED", decline_code: "OVER_LIMIT", amount_minor: TOTAL + SIMULATED_SURCHARGE_MINOR });
    expect(rail.card(card.id)?.state).toBe("ACTIVE");

    stub.setMode("honest");
    expect(await checkout("dm2_exact")).toMatchObject({ event: "AUTHORISED", amount_minor: TOTAL });
    expect(await checkout("dm2_replay")).toMatchObject({ event: "DECLINED", decline_code: "CARD_USED" });
    expect(rail.authorisations()).toHaveLength(1);
  });

  it("uses the configured overshoot", async () => {
    const { checkout } = await setup({ mode: "overshoot", overshootMinor: 1 });
    expect(await checkout("c")).toMatchObject({ decline_code: "OVER_LIMIT", amount_minor: TOTAL + 1 });
  });
});

describe("drift: the re-quote changes (R12)", () => {
  it("re-quotes a higher total with consistent components, and the rail still holds the limit", async () => {
    const { stub, cart, checkout, rail } = await setup({ mode: "drift" });
    const quote = await stub.quote({ cart, now: NOW });
    expect(quote.total_minor).toBe(TOTAL + SIMULATED_SURCHARGE_MINOR);
    expect(quote.total_minor).toBe(quote.subtotal_minor + quote.shipping_minor + quote.fees_minor + quote.fx_minor);
    expect(quote.shipping_minor).toBe(SIMULATED_SURCHARGE_MINOR);
    expect(await checkout("d1")).toMatchObject({ event: "DECLINED", decline_code: "OVER_LIMIT", amount_minor: quote.total_minor });
    expect(rail.authorisations()).toHaveLength(0);
  });

  it("a price drop re-quotes lower and settles at the new amount; the rest is released", async () => {
    const { stub, cart, checkout, rail, card } = await setup({ mode: "drift", driftMinor: -1_000 });
    const quote = await stub.quote({ cart, now: NOW });
    expect(quote.total_minor).toBe(TOTAL - 1_000);
    expect(quote.subtotal_minor).toBe(TOTAL - 1_000); // shipping was 0, so the cut lands on the items
    expect(await checkout("d2")).toMatchObject({ event: "AUTHORISED", amount_minor: TOTAL - 1_000 });
    expect(rail.ledger(card.id)).toMatchObject({ settled_minor: TOTAL - 1_000, released_minor: 1_000 });
  });

  it("refuses a drift that would make the quote negative", async () => {
    const { stub, cart } = await setup({ mode: "drift", driftMinor: -(TOTAL + 1) });
    await expect(stub.quote({ cart, now: NOW })).rejects.toBeInstanceOf(RailSimError);
  });

  it("does not mutate the cart it was given", async () => {
    const { stub, cart } = await setup({ mode: "drift" });
    await stub.quote({ cart, now: NOW }); // cart is frozen: a write would throw
    expect(cart.total_minor).toBe(TOTAL);
  });
});

describe("preauth: a hold above the quote [F2]", () => {
  it("is declined OVER_LIMIT on an exact-limit card (a false block, counted by the harness)", async () => {
    const { checkout, rail, card } = await setup({ mode: "preauth" });
    expect(await checkout("p1")).toMatchObject({ event: "DECLINED", decline_code: "OVER_LIMIT", amount_minor: TOTAL + SIMULATED_SURCHARGE_MINOR });
    expect(rail.card(card.id)?.state).toBe("ACTIVE");
    expect(rail.authorisations()).toHaveLength(0);
  });
});

describe("timeout: failure injection without a duplicate payment (F19)", () => {
  it("the first attempt throws a simulated timeout after the charge landed; the retry with the same key returns the same event", async () => {
    const { stub, checkout, rail } = await setup({ mode: "timeout" });
    await expect(checkout("t1")).rejects.toBeInstanceOf(SimulatedTimeoutError);
    expect(rail.authorisations()).toHaveLength(1); // the response was lost, the charge was not
    const retry = await checkout("t1");
    expect(retry).toMatchObject({ event: "AUTHORISED", amount_minor: TOTAL, idempotency_key: "t1" });
    expect(rail.authorisations()).toHaveLength(1);
    expect(stub.mode).toBe("timeout");
  });

  it("before_charge: the first attempt throws before reaching the rail; the retry charges exactly once", async () => {
    const { checkout, rail } = await setup({ mode: "timeout", timeoutPhase: "before_charge" });
    await expect(checkout("t2")).rejects.toBeInstanceOf(SimulatedTimeoutError);
    expect(rail.authorisations()).toHaveLength(0);
    expect(await checkout("t2")).toMatchObject({ event: "AUTHORISED" });
    expect(rail.authorisations()).toHaveLength(1);
  });

  it("times out timeoutCount times per key, then succeeds; other keys have their own count", async () => {
    const { checkout, rail } = await setup({ mode: "timeout", timeoutCount: 2 });
    await expect(checkout("t3")).rejects.toBeInstanceOf(SimulatedTimeoutError);
    await expect(checkout("t3")).rejects.toBeInstanceOf(SimulatedTimeoutError);
    expect(await checkout("t3")).toMatchObject({ event: "AUTHORISED" });
    await expect(checkout("t4")).rejects.toBeInstanceOf(SimulatedTimeoutError);
    expect(rail.authorisations()).toHaveLength(1);
  });

  it("the timeout error is labelled SIMULATED and carries the retry hint", async () => {
    const { checkout } = await setup({ mode: "timeout" });
    const err = await checkout("t5").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SimulatedTimeoutError);
    expect((err as SimulatedTimeoutError).code).toBe("SIMULATED_TIMEOUT");
    expect((err as SimulatedTimeoutError).message).toContain("SIMULATED");
  });
});

describe("wrong_merchant: charges from a different domain", () => {
  it("is declined MERCHANT_MISMATCH when the card carries a lock (SIMULATED feature)", async () => {
    const { stub, checkout, rail } = await setup({ mode: "wrong_merchant" }, { merchantLock: MERCHANT });
    const event = await checkout("w1");
    expect(event).toMatchObject({ event: "DECLINED", decline_code: "MERCHANT_MISMATCH" });
    expect(event.merchant_domain).not.toBe(MERCHANT);
    expect(rail.authorisations()).toHaveLength(0);
    stub.setMode("honest");
    expect(await checkout("w2")).toMatchObject({ event: "AUTHORISED" });
  });

  // Changed (lane s-fix-core, audit S-RAIL-4): the SIMULATED lock now defaults to the approved cart's domain, so a mint
  // without a lock is locked too. The real card still has no lock [F1]; that limitation is stated in docs/09, not here.
  it("is declined even when no lock was asked for: the lock defaults to the approved merchant", async () => {
    const { checkout } = await setup({ mode: "wrong_merchant" });
    const event = await checkout("w3");
    expect(event).toMatchObject({ event: "DECLINED", decline_code: "MERCHANT_MISMATCH" });
    expect(event.merchant_domain).not.toBe(MERCHANT);
  });

  it("never picks the cart's own domain as the wrong one", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: TOTAL });
    const stub = new MerchantStub({ rail, mode: "wrong_merchant", wrongDomain: MERCHANT });
    const event = await stub.checkout({ cart: cartWithTotal(TOTAL), handle: card.handle, idempotencyKey: "w4", now: NOW });
    expect(event.merchant_domain).not.toBe(MERCHANT);
  });
});
