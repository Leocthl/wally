import { describe, expect, it } from "vitest";
import { buildCart } from "../src/scenario/cart";
import { convertMinor, formatHkd, percentOfBp } from "../src/scenario/money";
import { loadFixture } from "@laisee/core/testing/fixtures";
import { mandateFromCredential } from "@laisee/core/vc";

describe("money helpers (integer minor units, decimal-string rates)", () => {
  it("converts with a decimal rate and rounds half up", () => {
    expect(convertMinor(10_000, "7.80")).toBe(78_000);
    expect(convertMinor(333, "7.5")).toBe(2_498); // 2497.5 rounds up
    expect(convertMinor(1, "0.5")).toBe(1);
    expect(convertMinor(0, "7.8")).toBe(0);
  });

  it("rejects a rate that is not a plain decimal string", () => {
    expect(() => convertMinor(100, "1e3")).toThrow(RangeError);
    expect(() => convertMinor(100, "-2")).toThrow(RangeError);
    expect(() => convertMinor(-1, "2")).toThrow(RangeError);
  });

  it("takes basis points with floor", () => {
    expect(percentOfBp(10_001, 100)).toBe(100);
    expect(percentOfBp(99, 100)).toBe(0);
  });

  it("formats HKD whole dollars without decimals and cents with two", () => {
    expect(formatHkd(25_900)).toBe("HK$259");
    expect(formatHkd(25_950)).toBe("HK$259.50");
    expect(formatHkd(5)).toBe("HK$0.05");
  });
});

describe("stand-in cart builder (core A-31 will replace it)", () => {
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
    const built = buildCart(base);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.cart.subtotal_minor).toBe(52_000);
    expect(built.cart.shipping_minor).toBe(3_000);
    expect(built.cart.total_minor).toBe(55_000);
    expect(built.cart.scameter.state).toBe("NOT_CHECKED");
    expect(built.cart.listing.text_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects an unknown title or another listing url instead of guessing", () => {
    expect(buildCart({ ...base, proposal: { ...base.proposal, items: [{ title: "Gift card bundle", qty: 1 }] } }).ok).toBe(false);
    expect(buildCart({ ...base, proposal: { ...base.proposal, listing_url: "https://other.example/p/x" } }).ok).toBe(false);
  });

  it("adds the fx fee to the total and records the rate source", () => {
    const built = buildCart({
      ...base,
      fx: { listedCurrency: "USD", listedAmountMinor: 6_000, rate: "7.50", rateSourceRef: "SIMULATED-not-a-market-rate" },
      listing: { ...listing, items: [{ title: "Denim jacket (SIMULATED)", category: "apparel", unit_price_minor: 45_000 }] },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.cart.fx?.fee_minor).toBe(450);
    expect(built.cart.total_minor).toBe(45_000 + 3_000 + 450);
  });
});
