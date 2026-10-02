import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mean, percentile, summarize, wilson } from "../src/judge/fit/stats";

describe("percentile (linear interpolation, numpy default)", () => {
  it("matches known values", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([10], 95)).toBe(10);
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
    expect(percentile([0, 10], 25)).toBe(2.5);
  });

  it("is monotone in p and bounded by the extremes (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true }), { minLength: 1, maxLength: 40 }), (xs) => {
        const sorted = [...xs].sort((a, b) => a - b);
        const ps = [0, 10, 25, 50, 75, 90, 100].map((p) => percentile(sorted, p));
        for (let i = 1; i < ps.length; i += 1) expect(ps[i] ?? 0).toBeGreaterThanOrEqual(ps[i - 1] ?? 0);
        expect(ps[0] ?? Number.NaN).toBeCloseTo(sorted[0] ?? Number.NaN, 9);
        expect(ps[ps.length - 1] ?? Number.NaN).toBeCloseTo(sorted[sorted.length - 1] ?? Number.NaN, 9);
      }),
    );
  });
});

describe("summarize", () => {
  it("summarises a sample and returns null for an empty one", () => {
    expect(summarize([])).toBeNull();
    const s = summarize([0.2, 0.4, 0.6, 0.8]);
    expect(s?.n).toBe(4);
    for (const [key, want] of [["min", 0.2], ["p25", 0.35], ["median", 0.5], ["p75", 0.65], ["max", 0.8], ["mean", 0.5]] as const) {
      expect(s?.[key] ?? Number.NaN, key).toBeCloseTo(want, 9);
    }
  });

  it("does not reorder its input", () => {
    const xs = [3, 1, 2];
    summarize(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});

describe("mean", () => {
  it("is the arithmetic mean, 0 for an empty list", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([])).toBe(0);
  });
});

describe("wilson 95% interval", () => {
  it("returns null without data and matches a known value", () => {
    expect(wilson(0, 0)).toBeNull();
    const ci = wilson(8, 10);
    expect(ci?.low).toBeCloseTo(0.4902, 3);
    expect(ci?.high).toBeCloseTo(0.9433, 3);
  });

  it("stays inside [0, 1], contains the observed rate and shrinks with n (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), fc.nat(), (n, seed) => {
        const k = seed % (n + 1);
        const ci = wilson(k, n);
        expect(ci).not.toBeNull();
        expect(ci?.low ?? -1).toBeGreaterThanOrEqual(0);
        expect(ci?.high ?? 2).toBeLessThanOrEqual(1);
        expect(ci?.low ?? 1).toBeLessThanOrEqual(k / n + 1e-9);
        expect(ci?.high ?? 0).toBeGreaterThanOrEqual(k / n - 1e-9);
        const bigger = wilson(k * 4, n * 4);
        expect((bigger?.high ?? 0) - (bigger?.low ?? 0)).toBeLessThanOrEqual((ci?.high ?? 0) - (ci?.low ?? 0) + 1e-9);
      }),
    );
  });
});
