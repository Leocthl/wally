// What the person shops for as a hint on Try asking (screens/home/tryRank.ts): it only re-orders and tags what the shelf already
// has, and never invents an item, never hides one and never touches what gets approved. Only the categories the person chose
// count; the style, colour and size picks of the first version of the first run are gone.
import { describe, expect, it } from "vitest";
import { SCENARIO_IDS } from "../src/api/types";
import { FAMILY_GROUP, TRY_GROUPS, TRY_ITEMS, type TryGroup, type TryItem } from "../src/screens/home/tryCatalog";
import { fitScores, rankTryItems } from "../src/screens/home/tryRank";
import { emptyProfile, mergeProfile } from "../src/state/profile";
import { FOR_YOU_MAX, SHOP_IDS, SHOP_PICKS } from "../src/state/shopping";

const GROUPS: readonly TryGroup[] = [...TRY_GROUPS, FAMILY_GROUP];
const inGroup = (items: readonly TryItem[], group: TryGroup): readonly string[] => items.filter((i) => i.group === group).map((i) => i.id);

describe("rankTryItems", () => {
  it("leaves the catalogue as it is when the person did not narrow what they shop for", () => {
    for (const profile of [null, emptyProfile(), mergeProfile(null, { nickname: "Mei" })]) {
      const ranked = rankTryItems(TRY_ITEMS, profile);
      expect(ranked.items).toEqual(TRY_ITEMS);
      expect(ranked.forYou.size).toBe(0);
    }
  });

  it("leaves the catalogue as it is for the categories the shelf has nothing in (there are no groceries, shoes or clothes picks)", () => {
    for (const shopFor of [["groceries"], ["footwear"], ["apparel"], ["groceries", "apparel", "footwear"]] as const) {
      const ranked = rankTryItems(TRY_ITEMS, mergeProfile(null, { shopFor }));
      expect(ranked.items, shopFor.join(",")).toEqual(TRY_ITEMS);
      expect(ranked.forYou.size).toBe(0);
    }
  });

  it("only ever re-orders: the same items in the same groups, whatever the person chose", () => {
    const profiles = [...SHOP_IDS.map((s) => mergeProfile(null, { shopFor: [s] })), mergeProfile(null, { shopFor: [...SHOP_IDS] }), mergeProfile(null, { shopFor: ["electronics", "footwear"] })];
    for (const profile of profiles) {
      const { items } = rankTryItems(TRY_ITEMS, profile);
      expect([...items].map((i) => i.id).sort()).toEqual(TRY_ITEMS.map((i) => i.id).sort());
      for (const group of GROUPS) expect([...inGroup(items, group)].sort()).toEqual([...inGroup(TRY_ITEMS, group)].sort());
      // The groups keep their place in the list.
      expect([...new Set(items.map((i) => i.group))]).toEqual([...new Set(TRY_ITEMS.map((i) => i.group))]);
    }
  });

  it("names only scenarios that exist (a pick can never point at an item the shelf lacks)", () => {
    const picked = Object.values(SHOP_PICKS).flat();
    expect(picked.length).toBeGreaterThan(0);
    for (const id of picked) {
      expect(SCENARIO_IDS).toContain(id);
      expect(TRY_ITEMS.map((i) => i.id), id).toContain(id);
    }
  });

  it("puts the earbuds first for someone who shops for electronics, and tags them", () => {
    const ranked = rankTryItems(TRY_ITEMS, mergeProfile(null, { shopFor: ["electronics"] }));
    expect(inGroup(ranked.items, "stops")[0]).toBe("off_category");
    expect([...ranked.forYou]).toEqual(["off_category"]);
  });

  it("tags at most three, and keeps the catalogue order between items that fit equally", () => {
    const ranked = rankTryItems(TRY_ITEMS, mergeProfile(null, { shopFor: ["electronics"] }));
    expect(ranked.forYou.size).toBeLessThanOrEqual(FOR_YOU_MAX);
    expect(inGroup(ranked.items, "stops").slice(1)).toEqual(inGroup(TRY_ITEMS, "stops").filter((id) => id !== "off_category"));
    expect(inGroup(ranked.items, "buy")).toEqual(inGroup(TRY_ITEMS, "buy"));
  });

  it("scores a pick by its place in a category's list, and not at all for a category without picks", () => {
    expect(fitScores(mergeProfile(null, { shopFor: ["electronics"] })).get("off_category")).toBe(1);
    expect(fitScores(mergeProfile(null, { shopFor: ["groceries"] })).size).toBe(0);
  });

  it("does not change what it is given", () => {
    const input = Object.freeze([...TRY_ITEMS]) as readonly TryItem[];
    const before = input.map((i) => i.id);
    rankTryItems(input, mergeProfile(null, { shopFor: ["electronics"] }));
    expect(input.map((i) => i.id)).toEqual(before);
  });
});
