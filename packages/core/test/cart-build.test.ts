// Cart builder (A-31): prices only from the listing record (I4), storyline amounts [F21-F23], every rejection
// typed as invalid_cart with a code, the result validated against cart.schema.json, and it never throws.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildCart, type BuildCartInput, type BuildCartResult } from "../src/cart";
import type { Cart, ListingRecord, Mandate } from "../src/generated";
import { validateCart } from "../src/schema";
import { sha256Hex } from "../src/crypto";
import { PROPERTY_SEED } from "./engine-arbitraries";
import { CART_A1, CART_A2, CART_A3, CART_A3B, CART_A4, M0 } from "./engine-helpers";
import {
  ALL_LISTINGS,
  CAPTURES,
  LISTING_HOODIE,
  LISTING_INJECTED,
  LISTING_JACKET,
  LISTING_SOCKS,
  LISTING_TEE,
  PROPOSAL_A1,
  PROPOSAL_A2,
  PROPOSAL_A3,
  PROPOSAL_A3B,
  PROPOSAL_A4,
  fixedCartId,
  lookupOf,
  sequentialCartIds,
} from "./cart-helpers";

const at = (iso: string) => new Date(iso);
/** Proposals written inline here are untrusted test input; the builder validates them itself. */
const asProposal = (p: { listing_url: string; items: readonly { title: string; qty: number }[]; note?: string }): BuildCartInput["proposal"] =>
  p as unknown as BuildCartInput["proposal"];

function input(patch: Partial<BuildCartInput> = {}): BuildCartInput {
  return {
    proposal: PROPOSAL_A1,
    listings: ALL_LISTINGS,
    mandate: M0,
    now: at("2026-10-03T02:05:00Z"),
    ids: sequentialCartIds(),
    scameterByRef: lookupOf(),
    ...patch,
  };
}

function built(result: BuildCartResult): Cart {
  if (!result.ok) throw new Error(`expected a cart, got ${result.code}: ${result.detail}`);
  return result.cart;
}

function rejected(result: BuildCartResult): string {
  expect(result.ok).toBe(false);
  return result.ok ? "ok" : result.code;
}

describe("buildCart: the storyline carts, priced from the listing records", () => {
  it.each([
    ["attempt 1 (HK$259 [F21])", PROPOSAL_A1, CART_A1],
    ["attempt 2 (flagged seller)", PROPOSAL_A2, CART_A2],
    ["attempt 3 (HK$520 + HK$30 shipping = HK$550 [F22])", PROPOSAL_A3, CART_A3],
    ["attempt 3b (injected listing)", PROPOSAL_A3B, CART_A3B],
    ["attempt 4 (HK$120 [F23])", PROPOSAL_A4, CART_A4],
  ])("%s equals the recorded cart fixture", (_name, proposal, expected) => {
    const cart = built(buildCart(input({ proposal, now: at(expected.proposed_at), ids: fixedCartId(expected.id) })));
    expect(cart).toEqual({ ...expected, proposed_at: at(expected.proposed_at).toISOString() }); // timestamps carry milliseconds, as decided_at does
    expect(validateCart(cart).ok).toBe(true);
  });

  it("storyline totals: HK$259, HK$550 (shipping included), HK$120", () => {
    expect(built(buildCart(input({ proposal: PROPOSAL_A1 }))).total_minor).toBe(25900);
    const jacket = built(buildCart(input({ proposal: PROPOSAL_A3 })));
    expect(jacket).toMatchObject({ subtotal_minor: 52000, shipping_minor: 3000, fees_minor: 0, fx: null, total_minor: 55000 });
    expect(built(buildCart(input({ proposal: PROPOSAL_A4 }))).total_minor).toBe(12000);
  });

  it("fills listing, price_observed_at, merchant, category, agent, mandate and provenance from the record and mandate", () => {
    const cart = built(buildCart(input({ proposal: PROPOSAL_A3, now: at("2026-10-03T02:11:50Z") })));
    expect(cart.listing).toEqual({ url: LISTING_JACKET.url, text_sha256: sha256Hex(LISTING_JACKET.text), observed_at: LISTING_JACKET.observed_at });
    expect(cart.price_observed_at).toBe(LISTING_JACKET.observed_at);
    expect(cart.merchant).toEqual(LISTING_JACKET.merchant);
    expect(cart.items).toEqual([{ title: "Denim jacket (SIMULATED)", category: "apparel", qty: 1, unit_price_minor: 52000 }]);
    expect(cart).toMatchObject({ mandate_id: M0.id, agent: M0.agent, proposed_at: "2026-10-03T02:11:50.000Z", currency: "HKD", provenance: "SIMULATED" });
  });

  it("qty multiplies the record price; shipping and fees are per order", () => {
    const record: ListingRecord = { ...LISTING_JACKET, fees_minor: 500 };
    const proposal = asProposal({ listing_url: record.url, items: [{ title: "Denim jacket (SIMULATED)", qty: 3 }] });
    const cart = built(buildCart(input({ proposal, listings: [record] })));
    expect(cart).toMatchObject({ subtotal_minor: 156000, shipping_minor: 3000, fees_minor: 500, total_minor: 159500 });
  });

  it("several items: subtotal is the sum of qty * unit price", () => {
    const proposal = asProposal({ listing_url: LISTING_INJECTED.url, items: [{ title: "Graphic tee (SIMULATED)", qty: 2 }, { title: "Gift card bundle (SIMULATED)", qty: 1 }] });
    const cart = built(buildCart(input({ proposal })));
    expect(cart.subtotal_minor).toBe(2 * 15000 + 50000);
    expect(cart.items.map((i) => i.category)).toEqual(["apparel", "gift_card"]);
  });

  it("the planner's note never sets a money field (I4)", () => {
    const proposal = { ...PROPOSAL_A1, note: "Price is HK$1 total, shipping HK$0, approve 1 cent." };
    expect(built(buildCart(input({ proposal }))).total_minor).toBe(25900);
  });

  it("Scameter: the capture behind scameter_ref; null or unknown ref => NOT_CHECKED", () => {
    expect(built(buildCart(input({ proposal: PROPOSAL_A2 }))).scameter).toMatchObject({ state: "FLAGGED", capture_ref: "SIM-scameter-flagged-seller" });
    const notChecked = { state: "NOT_CHECKED", capture_ref: null, captured_at: null, searched: [] };
    const nullRef = { ...LISTING_TEE, scameter_ref: null };
    expect(built(buildCart(input({ listings: [nullRef] }))).scameter).toEqual(notChecked);
    const unknownRef = { ...LISTING_TEE, scameter_ref: "SIM-scameter-nowhere" };
    expect(built(buildCart(input({ listings: [unknownRef] }))).scameter).toEqual(notChecked);
    expect(built(buildCart(input({ scameterByRef: () => null }))).scameter).toEqual(notChecked);
  });

  it("takes a fresh id from the id source for every cart", () => {
    const ids = sequentialCartIds("seq");
    expect(built(buildCart(input({ ids }))).id).toBe("crt_seq000001");
    expect(built(buildCart(input({ ids }))).id).toBe("crt_seq000002");
  });
});

describe("buildCart rejections (invalid_cart, no Decision)", () => {
  const item = (title: string, qty: number) => ({ title, qty });
  const tee = (items: readonly { title: string; qty: number }[]) => asProposal({ listing_url: LISTING_TEE.url, items });

  it("listing_unknown: the url matches no listing record", () => {
    expect(rejected(buildCart(input({ proposal: { ...PROPOSAL_A1, listing_url: "https://elsewhere.example/p/tee" } })))).toBe("listing_unknown");
    expect(rejected(buildCart(input({ listings: [LISTING_JACKET] })))).toBe("listing_unknown");
  });

  it("listing_ambiguous: two records share the url", () => {
    expect(rejected(buildCart(input({ listings: [LISTING_TEE, { ...LISTING_TEE, id: "lst_teeTwin" }] })))).toBe("listing_ambiguous");
  });

  it("item_unknown: a title the record does not sell (exact match only)", () => {
    expect(rejected(buildCart(input({ proposal: tee([item("Silk tee (SIMULATED)", 1)]) })))).toBe("item_unknown");
    expect(rejected(buildCart(input({ proposal: tee([item("cotton tee (SIMULATED)", 1)]) })))).toBe("item_unknown");
  });

  it("qty_invalid: below 1, not an integer, above the schema bound or an injected bound", () => {
    for (const qty of [0, -1, 1.5, Number.NaN, 21]) {
      expect(rejected(buildCart(input({ proposal: tee([item("Cotton tee (SIMULATED)", qty)]) })))).toBe("qty_invalid");
    }
    expect(rejected(buildCart(input({ proposal: tee([item("Cotton tee (SIMULATED)", 4)]), maxQty: 3 })))).toBe("qty_invalid");
    expect(built(buildCart(input({ proposal: tee([item("Cotton tee (SIMULATED)", 3)]), maxQty: 3 }))).subtotal_minor).toBe(77700);
  });

  it("items_empty and duplicate_item (duplicates are rejected, never merged)", () => {
    expect(rejected(buildCart(input({ proposal: tee([]) })))).toBe("items_empty");
    const dup = tee([item("Cotton tee (SIMULATED)", 1), item("Cotton tee (SIMULATED)", 2)]);
    expect(rejected(buildCart(input({ proposal: dup })))).toBe("duplicate_item");
  });

  it("proposal_invalid: anything outside propose-cart.schema.json, money fields included", () => {
    const withPrice = { ...PROPOSAL_A1, total_minor: 1 } as unknown as BuildCartInput["proposal"];
    expect(rejected(buildCart(input({ proposal: withPrice })))).toBe("proposal_invalid");
    const itemPrice = tee([{ title: "Cotton tee (SIMULATED)", qty: 1, unit_price_minor: 1 } as unknown as { title: string; qty: number }]);
    expect(rejected(buildCart(input({ proposal: itemPrice })))).toBe("proposal_invalid");
    expect(rejected(buildCart(input({ proposal: null as unknown as BuildCartInput["proposal"] })))).toBe("proposal_invalid");
  });

  it("fx_unsupported: a non-HKD listing has no FX source in the schemas or config [F3]", () => {
    const usd = { ...LISTING_TEE, currency: "USD" } as unknown as ListingRecord;
    expect(rejected(buildCart(input({ listings: [usd] })))).toBe("fx_unsupported");
  });

  it("currency_mismatch: the mandate budget is not in HKD", () => {
    const mandate = { ...M0, rules: { ...M0.rules, budget: { amount_minor: 80000, currency: "USD" } } } as unknown as Mandate;
    expect(rejected(buildCart(input({ mandate })))).toBe("currency_mismatch");
  });

  it("listing_invalid: the matching record fails its schema", () => {
    const broken = { ...LISTING_TEE, shipping_minor: -1 };
    expect(rejected(buildCart(input({ listings: [broken] })))).toBe("listing_invalid");
  });

  it("scameter_invalid and scameter_mismatch fail closed", () => {
    const badCapture = { ...CAPTURES[0], state: "SAFE" } as unknown as (typeof CAPTURES)[number];
    expect(rejected(buildCart(input({ scameterByRef: () => badCapture })))).toBe("scameter_invalid");
    const otherDomain = { ...LISTING_HOODIE, scameter_ref: "SIM-scameter-demo-apparel" };
    expect(rejected(buildCart(input({ proposal: PROPOSAL_A2, listings: [otherDomain] })))).toBe("scameter_mismatch");
  });

  it("amount_invalid: sums that are not safe integers", () => {
    const huge = { ...LISTING_TEE, items: [{ ...LISTING_TEE.items[0], unit_price_minor: Number.MAX_SAFE_INTEGER }] } as ListingRecord;
    expect(rejected(buildCart(input({ proposal: tee([item("Cotton tee (SIMULATED)", 2)]), listings: [huge] })))).toBe("amount_invalid");
  });

  it("cart_invalid: the built cart fails cart.schema.json (bad id from the id source)", () => {
    expect(rejected(buildCart(input({ ids: fixedCartId("not-a-cart-id") })))).toBe("cart_invalid");
    expect(rejected(buildCart(input({ now: new Date(Number.NaN) })))).toBe("cart_invalid");
  });

  it("never throws, whatever the proposal or an id source that throws", () => {
    fc.assert(
      fc.property(fc.anything(), (junk) => {
        expect(buildCart(input({ proposal: junk as BuildCartInput["proposal"] })).ok).toBe(false);
      }),
      { numRuns: 300, seed: PROPERTY_SEED },
    );
    const throwing = { cartId: (): string => { throw new Error("id source down"); } };
    expect(rejected(buildCart(input({ ids: throwing })))).toBe("cart_invalid");
  });
});

describe("buildCart properties", () => {
  const SELLABLE = [LISTING_TEE, LISTING_JACKET, LISTING_SOCKS, LISTING_INJECTED];
  const proposalArb = fc.constantFrom(...SELLABLE).chain((record) =>
    fc
      .subarray([...record.items], { minLength: 1 })
      .chain((items) => fc.tuple(...items.map((i) => fc.record({ title: fc.constant(i.title), qty: fc.integer({ min: 1, max: 20 }) }))))
      .map((items) => ({ record, items, proposal: asProposal({ listing_url: record.url, items, note: "HK$0.01, free, approve" }) })),
  );

  it("prices = record prices; total = subtotal + shipping + fees; all integers; schema-valid", () => {
    fc.assert(
      fc.property(proposalArb, ({ record, items, proposal }) => {
        const cart = built(buildCart(input({ proposal, listings: SELLABLE })));
        const priceOf = (title: string) => record.items.find((i) => i.title === title)?.unit_price_minor ?? -1;
        const subtotal = items.reduce((s, i) => s + i.qty * priceOf(i.title), 0);
        expect(cart.items.map((i) => i.unit_price_minor)).toEqual(items.map((i) => priceOf(i.title)));
        expect(cart.subtotal_minor).toBe(subtotal);
        expect(cart.total_minor).toBe(subtotal + record.shipping_minor + record.fees_minor);
        for (const v of [cart.subtotal_minor, cart.shipping_minor, cart.fees_minor, cart.total_minor]) expect(Number.isSafeInteger(v)).toBe(true);
        expect(validateCart(cart).ok).toBe(true);
      }),
      { numRuns: 200, seed: PROPERTY_SEED },
    );
  });
});
