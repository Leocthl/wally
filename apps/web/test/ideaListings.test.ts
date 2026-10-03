// The price on an idea card is the shop's own price: read from the same SIMULATED listing files the booth sells from, and equal
// to the total of the reference cart each booth scenario buys. Nothing here is a number of its own.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ideaCategory, ideaListing, readIdeaCategory, readIdeaListing } from "../src/screens/home/ideaListings";
import { IDEAS, type IdeaId } from "../src/screens/home/ideas";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../data/fixtures");
const read = (path: string): { readonly data: Record<string, unknown> } => JSON.parse(readFileSync(resolve(FIXTURES, path), "utf8"));

const LISTING_FILE: Readonly<Record<IdeaId, string>> = {
  tee: "listings/apparel-tee.json",
  socks: "listings/apparel-socks.json",
  jacket: "listings/streetwear-jacket.json",
  hoodie: "listings/flagged-seller-hoodie.json",
  graphic: "listings/injected-tee.json",
  earbuds: "listings/off-category-earbuds.json",
};
/** The reference cart each booth scenario buys (earbuds have none: it is an off-category stop). */
const CART_FILE: Readonly<Partial<Record<IdeaId, string>>> = {
  tee: "carts/attempt-1.json",
  hoodie: "carts/attempt-2.json",
  jacket: "carts/attempt-3.json",
  graphic: "carts/attempt-3b.json",
  socks: "carts/attempt-4.json",
};

describe("the listing behind each idea", () => {
  it("exists for every idea on the shelf", () => {
    for (const idea of IDEAS) expect(ideaListing(idea.id), idea.id).not.toBeNull();
  });

  it("is the first item of the listing file, plus its shipping", () => {
    for (const idea of IDEAS) {
      const data = read(LISTING_FILE[idea.id]).data as { items: { unit_price_minor: number }[]; shipping_minor: number; merchant: { name: string } };
      expect(ideaListing(idea.id), idea.id).toEqual({
        shop: data.merchant.name.replace(/\s*\(SIMULATED\)\s*$/, ""),
        priceMinor: data.items[0]!.unit_price_minor,
        shippingMinor: data.shipping_minor,
        totalMinor: data.items[0]!.unit_price_minor + data.shipping_minor,
      });
    }
  });

  it("totals what the scenario's reference cart totals, so the card and the purchase agree", () => {
    for (const [id, file] of Object.entries(CART_FILE) as [IdeaId, string][]) {
      expect(ideaListing(id)?.totalMinor, id).toBe(read(file).data["total_minor"]);
    }
  });

  it("names the item the idea asks for, as the listing's first item", () => {
    for (const idea of IDEAS) {
      const first = (read(LISTING_FILE[idea.id]).data as { items: { title: string }[] }).items[0]!.title.toLowerCase();
      const asked = idea.ask.toLowerCase().replace(/^(a|an)\s+/, "");
      expect(first, idea.id).toContain(asked.split(" ")[0]!);
    }
  });

  it("shows the shop without the (SIMULATED) tag the fixtures carry", () => {
    expect(ideaListing("tee")?.shop).toBe("Demo Apparel");
    expect(ideaListing("jacket")?.shop).toBe("Demo Streetwear");
  });
});

describe("the category behind each idea", () => {
  it("is the category of the listing file's first item, which is what the budget's categories are checked against", () => {
    for (const idea of IDEAS) {
      const first = (read(LISTING_FILE[idea.id]).data as { items: { category: string }[] }).items[0]!.category;
      expect(ideaCategory(idea.id), idea.id).toBe(first);
    }
    expect(ideaCategory("earbuds")).toBe("electronics");
    expect(ideaCategory("tee")).toBe("apparel");
  });
});

describe("readIdeaCategory", () => {
  it("reads the first item's category from a fixture envelope", () => {
    expect(readIdeaCategory({ data: { items: [{ category: "apparel" }, { category: "gift_card" }] } })).toBe("apparel");
  });

  it("gives null for anything that is not that shape: no listing, no items, no category, a category that is not text", () => {
    for (const file of [null, undefined, "apparel", [], {}, { data: null }, { data: {} }, { data: { items: [] } }, { data: { items: [{}] } }, { data: { items: [{ category: 3 }] } }]) {
      expect(readIdeaCategory(file), JSON.stringify(file)).toBeNull();
    }
  });
});

describe("readIdeaListing", () => {
  const good = { provenance: "SIMULATED", data: { merchant: { name: "Demo Shop (SIMULATED)" }, items: [{ unit_price_minor: 1200 }], shipping_minor: 300 } };

  it("reads a SIMULATED listing", () => {
    expect(readIdeaListing(good)).toEqual({ shop: "Demo Shop", priceMinor: 1200, shippingMinor: 300, totalMinor: 1500 });
  });

  it("gives nothing for a file that is not what it expects, and never throws", () => {
    const bad: unknown[] = [
      null,
      undefined,
      "x",
      [],
      {},
      { ...good, provenance: "OBSERVED" },
      { ...good, data: null },
      { ...good, data: { ...good.data, items: [] } },
      { ...good, data: { ...good.data, items: [{ unit_price_minor: -1 }] } },
      { ...good, data: { ...good.data, items: [{ unit_price_minor: 1.5 }] } },
      { ...good, data: { ...good.data, shipping_minor: "300" } },
      { ...good, data: { ...good.data, merchant: {} } },
    ];
    for (const file of bad) expect(readIdeaListing(file)).toBeNull();
  });
});
