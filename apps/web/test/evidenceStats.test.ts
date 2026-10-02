// Wilson score interval and k/n formatting for the Evidence screen. Known values come from an independent
// implementation (the judge-fit report in data/results) and from the closed form at k = 0 and k = n.
import { describe, expect, it } from "vitest";
import { formatInterval, formatPct, pctTenths, wilson } from "../src/evidence/stats";
import { parseChip } from "../src/evidence/chip";

const close = (a: number, b: number): void => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe("wilson", () => {
  it("matches the judge-fit report's intervals (independent implementation)", () => {
    const cases: readonly [number, number, number, number][] = [
      [5, 10, 0.23658959361548731, 0.7634104063845126],
      [2, 62, 0.008891184997076397, 0.11020677131018222],
      [19, 27, 0.515189666191624, 0.8414714668235244],
      [43, 50, 0.738135428014719, 0.9304925473797714],
    ];
    for (const [k, n, low, high] of cases) {
      const ci = wilson(k, n);
      expect(ci).not.toBeNull();
      close(ci!.low, low);
      close(ci!.high, high);
    }
  });

  it("gives the closed form at k = 0 and k = n", () => {
    const z2 = 1.96 ** 2;
    const zero = wilson(0, 10)!;
    expect(zero.low).toBe(0);
    close(zero.high, z2 / (10 + z2));
    const all = wilson(11, 11)!;
    expect(all.high).toBe(1);
    close(all.low, 0.7411599827511859);
  });

  it("has no interval when n = 0 and refuses impossible counts", () => {
    expect(wilson(0, 0)).toBeNull();
    expect(() => wilson(3, 2)).toThrow(RangeError);
    expect(() => wilson(-1, 2)).toThrow(RangeError);
    expect(() => wilson(1.5, 2)).toThrow(RangeError);
  });

  it("always contains the point estimate and stays inside 0..1", () => {
    for (let n = 1; n <= 40; n += 1) {
      for (let k = 0; k <= n; k += 1) {
        const ci = wilson(k, n)!;
        expect(ci.low).toBeGreaterThanOrEqual(0);
        expect(ci.high).toBeLessThanOrEqual(1);
        expect(ci.low).toBeLessThanOrEqual(k / n + 1e-12);
        expect(ci.high).toBeGreaterThanOrEqual(k / n - 1e-12);
      }
    }
  });
});

describe("percent formatting", () => {
  it("rounds to one decimal the way the harness does", () => {
    expect(formatPct(6, 150)).toBe("4.0%");
    expect(formatPct(17, 66)).toBe("25.8%");
    expect(formatPct(1, 13)).toBe("7.7%");
    expect(formatPct(66, 66)).toBe("100.0%");
    expect(formatPct(0, 150)).toBe("0.0%");
    expect(pctTenths(3, 91)).toBe(33);
  });

  it("prints no percentage when n = 0", () => {
    expect(formatPct(0, 0)).toBeNull();
    expect(formatInterval(0, 0)).toBeNull();
  });

  it("prints the interval in percent with one decimal", () => {
    expect(formatInterval(5, 10)).toBe("23.7 to 76.3%");
    expect(formatInterval(0, 10)).toBe("0.0 to 27.8%");
  });
});

describe("parseChip", () => {
  it("reads the chips the harness and judge-fit files carry", () => {
    expect(parseChip("MEASURED(n=150, seed=7, commit=4b69472)")).toEqual({ kind: "MEASURED", text: "MEASURED(n=150, seed=7, commit=4b69472)" });
    expect(parseChip("RECORDED(n=150, seed=7, commit=4b69472)")?.kind).toBe("RECORDED");
    expect(parseChip("SIMULATED")?.kind).toBe("SIMULATED");
    expect(parseChip("OBSERVED(2026-10-03 10:05 UTC+8, capture C01)")?.kind).toBe("OBSERVED");
    expect(parseChip("ASSUMED")?.kind).toBe("ASSUMED");
  });

  it("fails closed on anything else: no chip, no number", () => {
    for (const bad of [undefined, null, 3, "", "measured(n=3)", "MEASURED", "MEASURED(seed=7)", "GUESSED(n=3)", "RECORDED", "OBSERVED"]) {
      expect(parseChip(bad)).toBeNull();
    }
  });
});
