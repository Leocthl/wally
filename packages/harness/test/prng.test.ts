import { describe, expect, it } from "vitest";
import { createRng, deriveSeed, hashString } from "../src/prng";
import { sha256Hex, stableStringify } from "../src/canonical";
import { formatRatio, ratio, sumRatios } from "../src/ratio";
import { percentile, summarize } from "../src/stats";

describe("prng (mulberry32, never Math.random)", () => {
  it("gives the same stream for the same seed", () => {
    const a = createRng(7);
    const b = createRng(7);
    const xs = Array.from({ length: 20 }, () => a.next());
    const ys = Array.from({ length: 20 }, () => b.next());
    expect(xs).toEqual(ys);
  });

  it("gives different streams for different seeds", () => {
    const xs = Array.from({ length: 8 }, ((r) => () => r.next())(createRng(1)));
    const ys = Array.from({ length: 8 }, ((r) => () => r.next())(createRng(2)));
    expect(xs).not.toEqual(ys);
  });

  it("stays in [0,1) and int() respects inclusive bounds", () => {
    const r = createRng(99);
    for (let i = 0; i < 500; i += 1) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const k = r.int(3, 9);
      expect(k).toBeGreaterThanOrEqual(3);
      expect(k).toBeLessThanOrEqual(9);
      expect(Number.isInteger(k)).toBe(true);
    }
  });

  it("pick() returns members and rejects an empty list", () => {
    const r = createRng(5);
    const items = ["a", "b", "c"] as const;
    for (let i = 0; i < 50; i += 1) expect(items).toContain(r.pick(items));
    expect(() => r.pick([])).toThrow(RangeError);
  });

  it("deriveSeed is a pure function of its inputs and spreads neighbours", () => {
    expect(deriveSeed(7, 3)).toBe(deriveSeed(7, 3));
    expect(deriveSeed(7, 3)).not.toBe(deriveSeed(7, 4));
    expect(deriveSeed(7, 3)).not.toBe(deriveSeed(8, 3));
  });

  it("hashString is stable (FNV-1a 32 bit)", () => {
    expect(hashString("")).toBe(0x811c9dc5);
    expect(hashString("a")).toBe(0xe40c292c);
  });

  it("rejects a non-integer seed", () => {
    expect(() => createRng(1.5)).toThrow(RangeError);
    expect(() => createRng(Number.NaN)).toThrow(RangeError);
  });
});

describe("canonical json and sha256", () => {
  it("sorts keys at every depth and drops undefined", () => {
    expect(stableStringify({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: undefined } })).toBe('{"a":{"d":[3,{"x":2,"y":1}]},"b":1}');
  });

  it("hashes to the known SHA-256 of the empty string", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("is insensitive to key order", () => {
    expect(sha256Hex(stableStringify({ a: 1, b: 2 }))).toBe(sha256Hex(stableStringify({ b: 2, a: 1 })));
  });
});

describe("ratio: a rate never travels without k and n", () => {
  it("formats k/n first, with the percentage in brackets", () => {
    expect(formatRatio(ratio(3, 150))).toBe("3/150 (2.0%)");
    expect(formatRatio(ratio(0, 12))).toBe("0/12 (0.0%)");
  });

  it("prints n/a for an empty denominator instead of a number", () => {
    expect(formatRatio(ratio(0, 0))).toBe("0/0 (n/a)");
  });

  it("rejects k greater than n and negative or fractional counts", () => {
    expect(() => ratio(5, 4)).toThrow(RangeError);
    expect(() => ratio(-1, 4)).toThrow(RangeError);
    expect(() => ratio(1.5, 4)).toThrow(RangeError);
  });

  it("sums ratios", () => {
    expect(sumRatios([ratio(1, 2), ratio(2, 3)])).toEqual(ratio(3, 5));
  });
});

describe("percentiles (linear interpolation, same method as the Laya smoke test)", () => {
  it("matches numpy's default on a small sample", () => {
    const xs = [10, 20, 30, 40];
    expect(percentile(xs, 50)).toBe(25);
    expect(percentile(xs, 95)).toBeCloseTo(38.5, 10);
    expect(percentile([7], 95)).toBe(7);
  });

  it("summarize reports n with every statistic and null for an empty sample", () => {
    expect(summarize([30, 10, 20])).toMatchObject({ n: 3, p50: 20 });
    expect(summarize([])).toBeNull();
  });
});
