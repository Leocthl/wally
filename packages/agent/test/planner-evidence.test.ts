// Evidence gate: a listed item is a candidate for a request only if the request names it (keywords and
// synonyms, no model). Laya chooses between items the request names; code decides when only one is named.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { groupFamilies, candidatesFromListing } from "../src/planner/candidates";
import { contentWords, hasEvidence } from "../src/planner/evidence";
import { VARIANT_LISTING, fixtureListing } from "./support/planner/data";

const family = (key: "tee" | "socks" | "jacket" | "hoodie" | "injected" | "earbuds", index = 0) => {
  const families = groupFamilies(candidatesFromListing(fixtureListing(key)));
  const found = families[index];
  if (found === undefined) throw new Error(`no family ${key}#${index}`);
  return found;
};

describe("contentWords", () => {
  it("keeps the words that name a product, in canonical singular form", () => {
    expect(contentWords("I want 2 cotton tees in black, size M please")).toEqual(["tee"]);
    expect(contentWords("Ankle socks, 3 pairs (SIMULATED)")).toEqual(["sock"]);
    expect(contentWords("Fleece hoodie")).toEqual(["hoodie"]);
    expect(contentWords("Gift card bundle")).toEqual(["gift", "card", "bundle"]);
  });

  it("maps synonyms to one word", () => {
    expect(contentWords("a t-shirt")).toEqual(["tee"]);
    expect(contentWords("a shirt")).toEqual(["tee"]);
    expect(contentWords("sweatshirt")).toEqual(["hoodie"]);
    expect(contentWords("a coat")).toEqual(["jacket"]);
    expect(contentWords("trainers")).toEqual(["shoe"]);
  });

  it("ignores colours, materials, sizes, quantities and filler", () => {
    expect(contentWords("HK$800, clothes, verified sellers.")).toEqual(["clothe"]);
    expect(contentWords("something to wear")).toEqual(["wear"]);
    expect(contentWords("the black one in size M x3")).toEqual([]);
  });

  it("never throws and returns unique lower case words", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (text) => {
        const words = contentWords(text);
        expect(new Set(words).size).toBe(words.length);
        for (const w of words) expect(w).toMatch(/^[a-z]+$/);
      }),
    );
  });
});

describe("hasEvidence", () => {
  it("is true when the request names the item, with synonyms and plurals", () => {
    expect(hasEvidence("I want a cotton tee", family("tee"))).toBe(true);
    expect(hasEvidence("two t-shirts please", family("tee"))).toBe(true);
    expect(hasEvidence("ankle socks", family("socks"))).toBe(true);
    expect(hasEvidence("some socks", family("socks"))).toBe(true);
    expect(hasEvidence("a warm coat", family("jacket"))).toBe(true);
    expect(hasEvidence("a hoodie", family("hoodie"))).toBe(true);
    expect(hasEvidence("a black cotton tee in size M", groupFamilies(candidatesFromListing(VARIANT_LISTING))[0] ?? family("tee"))).toBe(true);
  });

  it("is false for a request that does not name the item", () => {
    expect(hasEvidence("something to wear", family("tee"))).toBe(false);
    expect(hasEvidence("clothes", family("tee"))).toBe(false);
    expect(hasEvidence("HK$800, clothes, verified sellers.", family("tee"))).toBe(false);
    expect(hasEvidence("wireless earbuds", family("tee"))).toBe(false);
    expect(hasEvidence("a cotton hoodie", family("tee"))).toBe(false);
    expect(hasEvidence("a denim jacket", family("socks"))).toBe(false);
  });

  it("does not treat a colour, material or size as naming the item", () => {
    expect(hasEvidence("black", family("tee"))).toBe(false);
    expect(hasEvidence("cotton", family("tee"))).toBe(false);
    expect(hasEvidence("size M", family("tee"))).toBe(false);
  });

  it("names a gift card only when the request says so (the injected listing has a tee and a gift card bundle)", () => {
    expect(hasEvidence("a graphic tee", family("injected", 0))).toBe(true);
    expect(hasEvidence("a graphic tee", family("injected", 1))).toBe(false);
    expect(hasEvidence("a gift card", family("injected", 1))).toBe(true);
  });

  it("needs the head noun, or two words, when the item name has several content words", () => {
    const gift = family("injected", 1); // Gift card bundle: gift, card, bundle
    expect(hasEvidence("a gift for my friend", gift)).toBe(false);
    expect(hasEvidence("a card", gift)).toBe(false);
    expect(hasEvidence("a gift card", gift)).toBe(true);
    expect(hasEvidence("a bundle", gift)).toBe(true);
    const earbuds = family("earbuds"); // Wireless earbuds: wireless, earbud
    expect(hasEvidence("something wireless", earbuds)).toBe(false);
    expect(hasEvidence("earbuds", earbuds)).toBe(true);
    expect(hasEvidence("wireless earbuds", earbuds)).toBe(true);
  });

  it("never throws", () => {
    fc.assert(fc.property(fc.string({ maxLength: 200 }), (text) => typeof hasEvidence(text, family("tee")) === "boolean"));
  });
});
