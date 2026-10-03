// Taste as a hint on Try asking (screens/home/tryRank.ts): it only re-orders and tags what the shelf already has, and
// never invents an item, never hides one and never touches what gets approved.
import { describe, expect, it } from "vitest";
import { SCENARIO_IDS } from "../src/api/types";
import { FAMILY_GROUP, TRY_GROUPS, TRY_ITEMS, type TryGroup, type TryItem } from "../src/screens/home/tryCatalog";
import { rankTryItems } from "../src/screens/home/tryRank";
import { emptyProfile, mergeProfile, type Profile } from "../src/state/profile";
import { FOR_YOU_MAX, SHOP_PICKS, STYLE_IDS, STYLE_PICKS, type StyleId } from "../src/state/taste";

const GROUPS: readonly TryGroup[] = [...TRY_GROUPS, FAMILY_GROUP];
const inGroup = (items: readonly TryItem[], group: TryGroup): readonly string[] => items.filter((i) => i.group === group).map((i) => i.id);
const withStyles = (...styles: StyleId[]): Profile => mergeProfile(null, { styles });

describe("rankTryItems", () => {
  it("leaves the catalogue as it is when there is no taste to lean on", () => {
    for (const profile of [null, emptyProfile(), mergeProfile(null, { nickname: "Mei", colours: ["black"], sizes: { top: "M", bottom: null, shoe: "40" } })]) {
      const ranked = rankTryItems(TRY_ITEMS, profile);
      expect(ranked.items).toEqual(TRY_ITEMS);
      expect(ranked.forYou.size).toBe(0);
    }
  });

  it("only ever re-orders: the same items in the same groups, whatever the taste", () => {
    const profiles = [...STYLE_IDS.map((s) => withStyles(s)), withStyles(...STYLE_IDS), mergeProfile(null, { shopFor: ["electronics", "footwear"] })];
    for (const profile of profiles) {
      const { items } = rankTryItems(TRY_ITEMS, profile);
      expect([...items].map((i) => i.id).sort()).toEqual(TRY_ITEMS.map((i) => i.id).sort());
      for (const group of GROUPS) expect([...inGroup(items, group)].sort()).toEqual([...inGroup(TRY_ITEMS, group)].sort());
      // The groups keep their place in the list.
      expect([...new Set(items.map((i) => i.group))]).toEqual([...new Set(TRY_ITEMS.map((i) => i.group))]);
    }
  });

  it("names only scenarios that exist (a pick can never point at an item the shelf lacks)", () => {
    const picked = [...Object.values(STYLE_PICKS).flat(), ...Object.values(SHOP_PICKS).flat()];
    for (const id of picked) {
      expect(SCENARIO_IDS).toContain(id);
      expect(TRY_ITEMS.map((i) => i.id), id).toContain(id);
    }
  });

  it("puts what fits the style first inside its group", () => {
    expect(inGroup(rankTryItems(TRY_ITEMS, withStyles("streetwear")).items, "stops").slice(0, 2)).toEqual(["overflow", "injected"]);
    expect(inGroup(rankTryItems(TRY_ITEMS, withStyles("sporty")).items, "buy")[0]).toBe("small");
    expect(inGroup(rankTryItems(TRY_ITEMS, withStyles("cozy")).items, "stops")[0]).toBe("flagged");
    expect(inGroup(rankTryItems(TRY_ITEMS, withStyles("basics")).items, "buy")[0]).toBe("normal");
  });

  it("puts the earbuds first for someone who shops for electronics", () => {
    const ranked = rankTryItems(TRY_ITEMS, mergeProfile(null, { shopFor: ["electronics"] }));
    expect(inGroup(ranked.items, "stops")[0]).toBe("off_category");
    expect(ranked.forYou.has("off_category")).toBe(true);
  });

  it("tags the items that fit, and at most three of them", () => {
    expect([...rankTryItems(TRY_ITEMS, withStyles("cozy")).forYou]).toEqual(["flagged"]);
    const all = rankTryItems(TRY_ITEMS, withStyles(...STYLE_IDS));
    expect(all.forYou.size).toBeLessThanOrEqual(FOR_YOU_MAX);
    expect(all.forYou.size).toBe(FOR_YOU_MAX);
  });

  it("keeps the catalogue order between items that fit equally", () => {
    // Two styles that each pick one different item: both score the same, so the catalogue order decides.
    const ranked = rankTryItems(TRY_ITEMS, withStyles("cozy", "sporty"));
    const stops = inGroup(ranked.items, "stops");
    expect(stops[0]).toBe("flagged");
    expect(inGroup(ranked.items, "buy")[0]).toBe("small");
    expect(stops.slice(1)).toEqual(inGroup(TRY_ITEMS, "stops").filter((id) => id !== "flagged"));
  });

  it("does not change what it is given", () => {
    const input = Object.freeze([...TRY_ITEMS]) as readonly TryItem[];
    const before = input.map((i) => i.id);
    rankTryItems(input, withStyles("streetwear"));
    expect(input.map((i) => i.id)).toEqual(before);
  });
});
