import { describe, expect, it } from "vitest";
import { buildScenarioCart, scameterLookup } from "../src/scenario/cart";
import { formatHkd } from "../src/scenario/money";
import { loadFixture } from "@wally/core/testing/fixtures";
import { mandateFromCredential } from "@wally/core/vc";

describe("money display (integer minor units)", () => {
  it("formats HKD whole dollars without decimals and cents with two", () => {
    expect(formatHkd(25_900)).toBe("HK$259");
    expect(formatHkd(25_950)).toBe("HK$259.50");
    expect(formatHkd(5)).toBe("HK$0.05");
  });
});

describe("the cart seam: scenario carts come from core's buildCart", () => {
  const listing = loadFixture("listings/streetwear-jacket.json", "listing-record");
  const mandate = mandateFromCredential(loadFixture("mandate/m0.credential.json", "mandate-credential"));
  const base = {
    cartId: "crt_unitcartA",
    mandate,
    listing,
    proposal: { listing_url: listing.url, items: [{ title: "Denim jacket (SIMULATED)", qty: 1 }] as [{ title: string; qty: number }] },
    scameter: null,
    now: new Date("2026-10-03T02:11:50Z"),
  } as const;

  it("prices from the listing record, shipping included, as attempt 3 does [F22]", () => {
    const cart = buildScenarioCart(base);
    expect(cart.subtotal_minor).toBe(52_000);
    expect(cart.shipping_minor).toBe(3_000);
    expect(cart.total_minor).toBe(55_000);
    expect(cart.fx).toBeNull();
    expect(cart.id).toBe("crt_unitcartA");
    expect(cart.scameter.state).toBe("NOT_CHECKED");
  });

  it("refuses an unknown title or another listing url instead of guessing, and says why", () => {
    expect(() => buildScenarioCart({ ...base, proposal: { ...base.proposal, items: [{ title: "Gift card bundle", qty: 1 }] } })).toThrow(/item_unknown/);
    expect(() => buildScenarioCart({ ...base, proposal: { ...base.proposal, listing_url: "https://other.example/p/x" } })).toThrow(/listing_unknown/);
  });

  it("looks up only the capture the scenario has", () => {
    const capture = loadFixture("scameter/flagged-seller.json", "scameter-capture");
    expect(scameterLookup(capture)(capture.capture_ref ?? "")).toBe(capture);
    expect(scameterLookup(capture)("another-ref")).toBeNull();
    expect(scameterLookup(null)("anything")).toBeNull();
  });
});
