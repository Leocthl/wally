// What "What can Wally buy for you?" holds and what is kept of it (screens/onboarding/ticks.ts): all four kinds start ticked, and
// all four or none is kept as no choice, so a profile is never made of a default.
import { describe, expect, it } from "vitest";
import { narrowed, tickedAtStart } from "../src/screens/onboarding/ticks";
import { SHOP_IDS, type ShopId } from "../src/state/shopping";

describe("tickedAtStart", () => {
  it("is all four kinds for a visitor who has told Wally nothing", () => {
    expect(tickedAtStart(undefined)).toEqual(SHOP_IDS);
    expect(tickedAtStart([])).toEqual(SHOP_IDS);
  });

  it("is what the visitor kept when they narrowed it on an earlier visit", () => {
    expect(tickedAtStart(["footwear"])).toEqual(["footwear"]);
    expect(tickedAtStart(["groceries", "electronics"])).toEqual(["groceries", "electronics"]);
  });
});

describe("narrowed", () => {
  it("keeps the ticks when they are some of the four", () => {
    for (const ticked of [["groceries"], ["apparel", "footwear"], ["groceries", "apparel", "electronics"]] as const) expect(narrowed(ticked), ticked.join(",")).toEqual(ticked);
  });

  it("keeps nothing for all four, which is any category, and nothing for none", () => {
    expect(narrowed(SHOP_IDS)).toEqual([]);
    expect(narrowed([])).toEqual([]);
  });

  it("keeps nothing for all four whatever their order", () => {
    const shuffled: readonly ShopId[] = ["electronics", "groceries", "footwear", "apparel"];
    expect(narrowed(shuffled)).toEqual([]);
  });

  it("does not change what it is given", () => {
    const given = Object.freeze(["footwear"]) as readonly ShopId[];
    narrowed(given);
    expect(given).toEqual(["footwear"]);
  });
});
