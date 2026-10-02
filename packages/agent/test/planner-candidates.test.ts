// Structured candidates from listing records: title attributes, families, labels. Listing text is never read.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateListingRecord } from "@laisee/core/schema";
import {
  candidatesFromListing,
  groupFamilies,
  parseTitle,
  resolveCandidates,
  slugify,
  uniqueLabels,
} from "../src/planner/candidates";
import { GRAPHIC_TEE_LISTING, VARIANT_LISTING, fixtureListing } from "./support/planner-data";

describe("test listings are valid listing records", () => {
  it("validates the in-memory variant listings", () => {
    expect(validateListingRecord(VARIANT_LISTING).ok).toBe(true);
    expect(validateListingRecord(GRAPHIC_TEE_LISTING).ok).toBe(true);
  });
});

describe("parseTitle", () => {
  it.each([
    ["Cotton tee, black, M (SIMULATED)", { baseName: "Cotton tee", size: "m", colour: "black" }],
    ["Cotton tee, dark green, XL (SIMULATED)", { baseName: "Cotton tee", size: "xl", colour: "dark green" }],
    ["Ankle socks, 3 pairs (SIMULATED)", { baseName: "Ankle socks, 3 pairs", size: null, colour: null }],
    ["Denim jacket (SIMULATED)", { baseName: "Denim jacket", size: null, colour: null }],
    ["T-shirt - Navy / L", { baseName: "T-shirt", size: "l", colour: "navy" }],
    ["Fleece hoodie, grey", { baseName: "Fleece hoodie", size: null, colour: "grey" }],
  ])("splits %j", (title, expected) => {
    expect(parseTitle(title)).toEqual(expected);
  });

  it("never throws and always returns a non-empty base name for a non-empty title", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 120 }), (title) => {
        const parsed = parseTitle(title);
        expect(parsed.baseName.length).toBeGreaterThan(0);
      }),
    );
  });
});

describe("candidatesFromListing", () => {
  it("maps each listing item to one candidate with its price, shipping and fees", () => {
    const jacket = candidatesFromListing(fixtureListing("jacket"));
    expect(jacket).toEqual([
      {
        listingId: "lst_demoJacket",
        listingUrl: "https://demo-streetwear.example/p/jacket",
        title: "Denim jacket (SIMULATED)",
        baseName: "Denim jacket",
        category: "apparel",
        unitPriceMinor: 52000,
        shippingMinor: 3000,
        feesMinor: 0,
        size: null,
        colour: null,
      },
    ]);
  });

  it("reads variants out of the item titles", () => {
    const variants = candidatesFromListing(VARIANT_LISTING);
    expect(variants.map((c) => [c.colour, c.size])).toEqual([["black", "s"], ["black", "m"], ["black", "l"], ["white", "m"], ["white", "l"]]);
    expect(new Set(variants.map((c) => c.baseName))).toEqual(new Set(["Cotton tee"]));
  });

  it("ignores the listing text completely", () => {
    const injected = fixtureListing("injected");
    const changed = { ...injected, text: "completely different text" };
    expect(candidatesFromListing(changed)).toEqual(candidatesFromListing(injected));
  });
});

describe("resolveCandidates", () => {
  const catalogue = new Map([fixtureListing("tee"), fixtureListing("socks")].map((r) => [r.url, r] as const));

  it("resolves only listings the catalogue knows, by exact url", () => {
    const tee = fixtureListing("tee");
    const resolved = resolveCandidates(
      [{ url: tee.url, text: "x" }, { url: "https://unknown.example/p/1", text: "y" }, { url: `${tee.url}/`, text: "z" }],
      catalogue,
    );
    expect(resolved.map((c) => c.title)).toEqual(["Cotton tee (SIMULATED)"]);
  });

  it("returns no candidates for no listings and de-duplicates a repeated listing", () => {
    expect(resolveCandidates([], catalogue)).toEqual([]);
    const tee = fixtureListing("tee");
    expect(resolveCandidates([{ url: tee.url, text: "" }, { url: tee.url, text: "" }], catalogue)).toHaveLength(1);
  });
});

describe("groupFamilies", () => {
  it("groups variants of one product into one family", () => {
    const families = groupFamilies(candidatesFromListing(VARIANT_LISTING));
    expect(families).toHaveLength(1);
    expect(families[0]?.variants).toHaveLength(5);
    expect(families[0]?.baseName).toBe("Cotton tee");
  });

  it("keeps same-named products of different listings apart", () => {
    const a = candidatesFromListing(fixtureListing("tee"));
    const b = candidatesFromListing({ ...fixtureListing("tee"), id: "lst_otherTee", url: "https://other.example/p/tee" });
    expect(groupFamilies([...a, ...b])).toHaveLength(2);
  });
});

describe("labels", () => {
  it("slugifies titles into semantic labels without the SIMULATED marker", () => {
    expect(slugify("Cotton tee (SIMULATED)")).toBe("cotton_tee");
    expect(slugify("Ankle socks, 3 pairs (SIMULATED)")).toBe("ankle_socks_3_pairs");
    expect(slugify("3 pairs")).toBe("item_3_pairs");
    expect(slugify("")).toBe("item");
  });

  it("makes labels unique, valid and stable", () => {
    expect(uniqueLabels(["tee", "tee", "hoodie", "tee"])).toEqual(["tee", "tee_2", "hoodie", "tee_3"]);
    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 60 }), { maxLength: 12 }), (titles) => {
        const labels = uniqueLabels(titles.map(slugify));
        expect(new Set(labels).size).toBe(labels.length);
        for (const l of labels) expect(l).toMatch(/^[a-z][a-z0-9_]{0,47}$/);
        expect(uniqueLabels(titles.map(slugify))).toEqual(labels);
      }),
    );
  });
});
