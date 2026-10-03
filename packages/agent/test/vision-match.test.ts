// Matching a picture to the simulated shop: a table of scored cases (kind must match or be close, colour by Lab
// distance, bonuses for pattern, fit and style), the order and the top four, the reason ids, and the budget badge.
import { describe, expect, it } from "vitest";
import { colorDistance } from "../src/vision/color";
import { CLOSE_COLOR_FIT, COLOR_FALLOFF, DEFAULT_LIMIT, fitsBudget, matchShelf, SAME_COLOR_FIT, scoreItem, WEIGHTS, type MatchQuery, type ShelfItem } from "../src/vision/match";

let n = 0;
const item = (patch: Partial<ShelfItem> = {}): ShelfItem => {
  n += 1;
  return { id: `lst_item${String(n).padStart(3, "0")}`, kind: "hoodie", colors: ["navy"], pattern: "plain", fit: "relaxed", style: ["streetwear"], priceMinor: 34_900, shippingMinor: 0, ...patch };
};
const query = (patch: Partial<MatchQuery> = {}): MatchQuery => ({ kind: "hoodie", colors: ["navy"], pattern: "plain", fit: "relaxed", style: ["streetwear"], ...patch });
const NEUTRAL: MatchQuery = { kind: "hoodie", colors: [], pattern: null, fit: null, style: [] };

describe("score table (points out of 100: kind 50 or 25, colour 30, pattern 8, fit 6, style 6)", () => {
  it("weights add up to a perfect 100", () => {
    expect(WEIGHTS.kind + WEIGHTS.color + WEIGHTS.pattern + WEIGHTS.fit + WEIGHTS.style).toBe(100);
  });

  it.each([
    ["everything matches", query(), item(), 100],
    ["a far colour earns no colour points", query(), item({ colors: ["orange"] }), 70],
    ["a close kind (hoodie for jacket) earns the smaller kind share", query(), item({ kind: "jacket", fit: "regular", style: ["sporty"] }), 25 + 30 + 8 + 3 + 0],
    ["fit one step away earns half (relaxed for oversized)", query(), item({ colors: ["grey"], fit: "oversized", style: ["cozy"] }), 50 + 0 + 8 + 3 + 0],
    ["nothing set on the query earns the neutral half of each part", NEUTRAL, item(), 50 + 15 + 4 + 3 + 3],
    ["an unknown fit asks for nothing", query({ fit: "unknown" }), item(), 50 + 30 + 8 + 3 + 6],
    ["print for a logo item earns half the pattern points", query({ pattern: "print" }), item({ pattern: "logo" }), 50 + 30 + 4 + 6 + 6],
    ["plain for a print item earns none", query({ pattern: "plain" }), item({ pattern: "print" }), 50 + 30 + 0 + 6 + 6],
    ["half the style tags shared earns half the style points", query({ style: ["streetwear", "cozy"] }), item({ style: ["cozy"] }), 50 + 30 + 8 + 6 + 3],
    ["a second colour on the picture the item lacks costs a third of the colour points", query({ colors: ["navy", "white"] }), item({ colors: ["navy"] }), 50 + 20 + 8 + 6 + 6],
    ["a second colour the item has restores them", query({ colors: ["navy", "white"] }), item({ colors: ["navy", "white"] }), 100],
  ] as const)("%s", (_name, q, i, expected) => {
    expect(scoreItem(q, i)?.score).toBe(expected);
  });

  it("the far-colour case really is beyond the falloff distance", () => {
    expect(colorDistance("navy", "orange")).toBeGreaterThan(COLOR_FALLOFF);
    expect(colorDistance("navy", "grey")).toBeGreaterThanOrEqual(COLOR_FALLOFF - 1);
  });

  it("leaves out an item whose kind is neither the same nor close, and every item when the query has no kind", () => {
    expect(scoreItem(query(), item({ kind: "jeans" }))).toBeNull();
    expect(scoreItem(query(), item({ kind: "dress" }))).toBeNull();
    expect(scoreItem(query({ kind: null }), item())).toBeNull();
    expect(scoreItem(query({ kind: "bag" }), item())).toBeNull();
    expect(scoreItem(query({ kind: "not_clothing" }), item())).toBeNull();
  });

  it.each([
    ["tee", "polo"],
    ["tee", "shirt"],
    ["sweater", "hoodie"],
    ["hoodie", "jacket"],
    ["jeans", "trousers"],
    ["trousers", "shorts"],
    ["dress", "skirt"],
    ["sneakers", "boots"],
  ] as const)("%s and %s stand in for each other", (a, b) => {
    expect(scoreItem(query({ kind: a }), item({ kind: b }))).not.toBeNull();
    expect(scoreItem(query({ kind: b }), item({ kind: a }))).not.toBeNull();
  });

  it("ranks the right kind ahead of a close kind when the colours are equally near", () => {
    const right = scoreItem(query({ colors: ["red"] }), item({ colors: ["red"] }));
    const close = scoreItem(query({ colors: ["red"] }), item({ kind: "jacket", colors: ["red"] }));
    expect(right?.score).toBeGreaterThan(close?.score ?? 0);
  });

  it("lets a much better colour lift a close kind above the right kind in a poor colour (never above the right kind in a good one)", () => {
    const poorColour = scoreItem(query({ colors: ["red"], fit: null, style: [] }), item({ colors: ["navy"], fit: "relaxed", style: [] }));
    const closeGoodColour = scoreItem(query({ colors: ["red"], fit: null, style: [] }), item({ kind: "jacket", colors: ["red"], style: [] }));
    expect(closeGoodColour?.score).toBeGreaterThan(poorColour?.score ?? 0);
  });
});

describe("reasons", () => {
  it("names what earned the points, in the order the screen shows them", () => {
    expect(scoreItem(query(), item())?.reasons).toEqual(["same_kind", "same_color", "same_fit", "same_style"]);
    expect(scoreItem(query({ pattern: "logo" }), item({ pattern: "logo" }))?.reasons).toEqual(["same_kind", "same_color", "same_pattern", "same_fit", "same_style"]);
  });

  it("says close kind and close colour for a near miss, and nothing about a colour that is far", () => {
    expect(colorDistance("navy", "black")).toBeLessThan(COLOR_FALLOFF);
    const near = scoreItem(query({ kind: "jacket", fit: null, style: [] }), item({ colors: ["black"] }));
    expect(near?.reasons).toEqual(["close_kind", "close_color"]);
    expect(near?.colorFit).toBeGreaterThanOrEqual(CLOSE_COLOR_FIT);
    expect(near?.colorFit).toBeLessThan(SAME_COLOR_FIT);
    expect(scoreItem(query({ fit: null, style: [] }), item({ colors: ["orange"] }))?.reasons).toEqual(["same_kind"]);
  });

  it("does not call plain a matching pattern, or an unknown fit a matching fit", () => {
    expect(scoreItem(query({ fit: "unknown" }), item({ fit: "unknown" }))?.reasons).not.toContain("same_fit");
    expect(scoreItem(query(), item())?.reasons).not.toContain("same_pattern");
  });
});

describe("matchShelf", () => {
  const shelf = [
    item({ colors: ["navy"], priceMinor: 34_900 }),
    item({ colors: ["grey"], fit: "oversized", style: ["cozy"], priceMinor: 32_900 }),
    item({ colors: ["black"], priceMinor: 39_900 }),
    item({ kind: "jacket", colors: ["navy"], fit: "regular", style: ["sporty"], priceMinor: 44_900 }),
    item({ kind: "tee", colors: ["navy"], priceMinor: 14_900 }),
    item({ kind: "jeans", colors: ["denim"], priceMinor: 34_900 }),
    item({ kind: "hoodie", colors: ["navy"], priceMinor: 29_900 }),
  ];

  it("returns the best four, best first, and leaves out unrelated kinds", () => {
    const out = matchShelf(query(), shelf);
    expect(out).toHaveLength(DEFAULT_LIMIT);
    expect(out.map((m) => m.score)).toEqual([...out.map((m) => m.score)].sort((a, b) => b - a));
    expect(out.every((m) => m.item.kind === "hoodie" || m.item.kind === "jacket")).toBe(true);
    expect(out.map((m) => m.item.kind)).not.toContain("jeans");
  });

  it("breaks a tie by colour, then exact kind, then the lower price, then id", () => {
    const a = item({ id: "lst_tieB", priceMinor: 20_000 });
    const b = item({ id: "lst_tieA", priceMinor: 20_000 });
    const cheaper = item({ id: "lst_tieC", priceMinor: 10_000 });
    expect(matchShelf(query(), [a, b, cheaper]).map((m) => m.item.id)).toEqual(["lst_tieC", "lst_tieA", "lst_tieB"]);
  });

  it("gives the same order for the same shelf however it is arranged", () => {
    const reversed = [...shelf].reverse();
    expect(matchShelf(query(), reversed).map((m) => m.item.id)).toEqual(matchShelf(query(), shelf).map((m) => m.item.id));
  });

  it("returns nothing for no kind, an empty shelf or a limit of zero, and honours a larger limit", () => {
    expect(matchShelf(query({ kind: null }), shelf)).toEqual([]);
    expect(matchShelf(query(), [])).toEqual([]);
    expect(matchShelf(query(), shelf, 0)).toEqual([]);
    expect(matchShelf(query(), shelf, 10).length).toBe(5);
  });

  it("does not change the shelf it was given", () => {
    const before = JSON.stringify(shelf);
    matchShelf(query(), shelf);
    expect(JSON.stringify(shelf)).toBe(before);
  });
});

describe("fitsBudget (a badge, never a filter)", () => {
  it("is true when the whole order fits what is left, false when it does not, and null when the budget is not known", () => {
    expect(fitsBudget(34_900, 80_000)).toBe(true);
    expect(fitsBudget(80_000, 80_000)).toBe(true);
    expect(fitsBudget(80_001, 80_000)).toBe(false);
    expect(fitsBudget(100, null)).toBeNull();
    expect(fitsBudget(100, Number.NaN)).toBeNull();
  });
});
