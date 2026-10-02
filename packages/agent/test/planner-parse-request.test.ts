// Deterministic request parsing: sizes, colours and quantity from the shopper request. No model involved.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_QTY, parseColours, parseQuantity, parseSizes } from "../src/planner/parse-request";

describe("parseSizes", () => {
  it.each([
    ["size M please", ["m"]],
    ["in size XL", ["xl"]],
    ["a black tee, M", ["m"]],
    ["M and L", ["m", "l"]],
    ["I want it in large", ["l"]],
    ["extra large hoodie", ["xl"]],
    ["XXL", ["xxl"]],
    ["2XL tee", ["xxl"]],
    ["size 42 sneakers", ["42"]],
    ["sneakers in size 7", ["7"]],
    ["size 8.5", ["8.5"]],
    ["small", ["s"]],
  ])("reads sizes in %j", (text, expected) => {
    expect(parseSizes(text)).toEqual(expected);
  });

  it.each([
    "let's get a tee, I'm in a hurry",
    "HK$800, clothes, verified sellers.",
    "a cotton tee",
    "under 500",
    "it's a small world",
    "",
  ])("finds no size in %j", (text) => {
    expect(parseSizes(text)).toEqual([]);
  });

  it("never throws and only returns known size tokens", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (text) => {
        const sizes = parseSizes(text);
        expect(new Set(sizes).size).toBe(sizes.length);
        for (const s of sizes) expect(s).toMatch(/^(xxs|xs|s|m|l|xl|xxl|xxxl|\d{1,2}(\.5)?)$/);
      }),
    );
  });
});

describe("parseColours", () => {
  it.each([
    ["black tee", ["black"]],
    ["a dark green hoodie", ["dark green"]],
    ["grey or gray", ["grey"]],
    ["white and Black", ["white", "black"]],
    ["navy jacket", ["navy"]],
  ])("reads colours in %j", (text, expected) => {
    expect(parseColours(text)).toEqual(expected);
  });

  it("finds no colour when none is named", () => {
    expect(parseColours("a cotton tee, size M")).toEqual([]);
    expect(parseColours("blackboard")).toEqual([]);
  });

  it("never throws on arbitrary text", () => {
    fc.assert(fc.property(fc.string({ maxLength: 200 }), (text) => Array.isArray(parseColours(text))));
  });
});

describe("parseQuantity", () => {
  const TEE = ["cotton", "tee"];

  it.each([
    ["2 cotton tees", { kind: "qty", qty: 2 }],
    ["two tees please", { kind: "qty", qty: 2 }],
    ["I want 3 of the cotton tee", { kind: "qty", qty: 3 }],
    ["cotton tee x4", { kind: "qty", qty: 4 }],
    ["3x cotton tee", { kind: "qty", qty: 3 }],
    ["get me five black cotton tees in size M", { kind: "qty", qty: 5 }],
    ["2 pcs", { kind: "qty", qty: 2 }],
  ])("reads %j", (text, expected) => {
    expect(parseQuantity(text, TEE)).toEqual(expected);
  });

  it.each([
    "a cotton tee",
    "HK$800, clothes, verified sellers.",
    "HK$ 800 cotton tee",
    "cotton tee under 500",
    "size 38 cotton tee",
    "800 HKD cotton tee",
    "500 hk$ for a cotton tee",
    "the white one in large",
  ])("defaults to none for %j (a budget, a size or no number)", (text) => {
    expect(parseQuantity(text, TEE)).toEqual({ kind: "none" });
  });

  it("ignores a pack count that is part of the item title", () => {
    const socks = ["ankle", "socks"];
    expect(parseQuantity("3 pairs of socks", socks, ["3 pairs"])).toEqual({ kind: "none" });
    expect(parseQuantity("two packs of ankle socks", socks, ["3 pairs"])).toEqual({ kind: "qty", qty: 2 });
  });

  it("rejects quantities the proposal schema cannot hold and conflicting numbers", () => {
    expect(parseQuantity("21 tees", TEE)).toEqual({ kind: "invalid" });
    expect(parseQuantity("0 tees", TEE)).toEqual({ kind: "invalid" });
    expect(parseQuantity("2 tees and 3 tees", TEE)).toEqual({ kind: "invalid" });
    expect(parseQuantity("2 tees, 2 cotton tees", TEE)).toEqual({ kind: "qty", qty: 2 });
  });

  it("does not take the quantity of another product", () => {
    expect(parseQuantity("a tee and 3 hoodies", TEE)).toEqual({ kind: "none" });
  });

  it("never throws and keeps a parsed quantity inside the schema range", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), fc.array(fc.string({ maxLength: 12 }), { maxLength: 4 }), (text, nouns) => {
        const result = parseQuantity(text, nouns);
        if (result.kind === "qty") {
          expect(Number.isInteger(result.qty)).toBe(true);
          expect(result.qty).toBeGreaterThanOrEqual(1);
          expect(result.qty).toBeLessThanOrEqual(MAX_QTY);
        }
      }),
    );
  });
});
