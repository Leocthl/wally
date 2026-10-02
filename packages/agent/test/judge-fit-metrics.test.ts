import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { gateById } from "../src/judge/fit/gates";
import {
  SEARCH_GRID,
  calibration,
  distributionByLabel,
  operatingPoint,
  samplesFor,
  suggest,
  sweep,
  type Sample,
} from "../src/judge/fit/metrics";
import { row } from "./support/fit-data";

// Fit loops and property runs slow down on a loaded machine; give every test here an explicit budget.
vi.setConfig({ testTimeout: 60_000 });

const injection = gateById("injection_risk");
const scope = gateById("scope_fit");

const sample = (id: string, positive: boolean, value: number, risk = value): Sample => ({ id, positive, value, risk, label: positive ? "pos" : "neg" });
const separable: readonly Sample[] = [
  sample("p1", true, 0.7),
  sample("p2", true, 0.8),
  sample("p3", true, 0.9),
  sample("n1", false, 0.1),
  sample("n2", false, 0.2),
  sample("n3", false, 0.3),
];

describe("samplesFor", () => {
  const results = [
    row("a", { injection_risk: "injection" }, { clean: 0.2 }),
    row("b", { injection_risk: "clean" }, { clean: 0.8 }),
    row("c", { injection_risk: "suspicious" }, { clean: 0.5 }),
    row("d", { injection_risk: "injection" }, null),
    row("e", { injection_risk: "injection" }, { clean: 0.4 }, { status: "ERROR", answers: null }),
  ];

  it("keeps OK results with a clear label and drops ambiguous labels and failed calls", () => {
    const samples = samplesFor(injection, results);
    expect(samples.map((s) => s.id)).toEqual(["a", "b"]);
    expect(samples.map((s) => s.positive)).toEqual([true, false]);
    expect(samples[0]?.value).toBeCloseTo(0.8, 9);
  });
});

describe("operatingPoint", () => {
  it("counts the confusion matrix and derives precision, recall and false-block rate", () => {
    const p = operatingPoint(injection, separable, 0.5);
    expect(p.confusion).toEqual({ tp: 3, fp: 0, fn: 0, tn: 3 });
    expect([p.precision, p.recall, p.falseBlockRate]).toEqual([1, 1, 0]);
  });

  it("counts a miss and a false block", () => {
    const p = operatingPoint(injection, [...separable, sample("n4", false, 0.75), sample("p4", true, 0.4)], 0.5);
    expect(p.confusion).toEqual({ tp: 3, fp: 1, fn: 1, tn: 3 });
    expect(p.precision).toBeCloseTo(0.75, 9);
    expect(p.recall).toBeCloseTo(0.75, 9);
    expect(p.falseBlockRate).toBeCloseTo(0.25, 9);
    expect(p.recallCI?.low).toBeLessThan(0.75);
  });

  it("reports null instead of dividing by zero", () => {
    const p = operatingPoint(injection, [sample("n", false, 0.1)], 0.5);
    expect(p.recall).toBeNull();
    expect(p.precision).toBeNull();
    expect(p.falseBlockRate).toBe(0);
  });

  it("uses the strict comparison of scope_fit (stop below T)", () => {
    const samples = [sample("p", true, 0.3, 0.7), sample("n", false, 0.8, 0.2)];
    expect(operatingPoint(scope, samples, 0.55).confusion).toEqual({ tp: 1, fp: 0, fn: 0, tn: 1 });
    expect(operatingPoint(scope, [sample("p", true, 0.55, 0.45)], 0.55).confusion.fn).toBe(1);
  });
});

describe("sweep (property)", () => {
  const samples = fc
    .array(fc.record({ positive: fc.boolean(), value: fc.double({ min: 0, max: 1, noNaN: true }) }), { minLength: 1, maxLength: 40 })
    .map((rows) => rows.map((r, i) => sample(`s${i}`, r.positive, r.value)));

  it("adds up, stays in range and moves monotonically as the gate gets stricter", () => {
    fc.assert(
      fc.property(samples, (xs) => {
        for (const gate of [injection, scope]) {
          const points = sweep(gate, xs);
          const positives = xs.filter((s) => s.positive).length;
          let lastRecall = -1;
          let lastFalseBlock = -1;
          for (const p of points) {
            expect(p.confusion.tp + p.confusion.fn).toBe(positives);
            expect(p.confusion.fp + p.confusion.tn).toBe(xs.length - positives);
            for (const v of [p.precision, p.recall, p.falseBlockRate]) if (v !== null) expect(v >= 0 && v <= 1).toBe(true);
            if (p.recall !== null) {
              expect(p.recall).toBeGreaterThanOrEqual(lastRecall - 1e-12);
              lastRecall = p.recall;
            }
            if (p.falseBlockRate !== null) {
              expect(p.falseBlockRate).toBeGreaterThanOrEqual(lastFalseBlock - 1e-12);
              lastFalseBlock = p.falseBlockRate;
            }
          }
        }
      }),
    );
  });

  it("goes from the most relaxed to the strictest threshold", () => {
    const up = sweep(injection, separable).map((p) => p.t);
    expect(up[0]).toBeGreaterThan(up[up.length - 1] ?? 1);
    const down = sweep(scope, separable).map((p) => p.t);
    expect(down[0]).toBeLessThan(down[down.length - 1] ?? 0);
    expect(SEARCH_GRID[0]).toBeGreaterThan(0);
    expect(SEARCH_GRID[SEARCH_GRID.length - 1]).toBeLessThan(1);
  });
});

describe("suggest", () => {
  const budget = 0.1;

  it("takes the middle of the gap when the corpus is perfectly separable", () => {
    const s = suggest(injection, separable, sweep(injection, separable), budget);
    expect(s.kind).toBe("separable_midpoint");
    expect(s.t).toBeCloseTo(0.5, 6);
    expect(s.point?.recall).toBe(1);
    expect(s.point?.falseBlockRate).toBe(0);
  });

  it("uses the midpoint the other way round for scope_fit", () => {
    const xs = [sample("p1", true, 0.2, 0.8), sample("p2", true, 0.4, 0.6), sample("n1", false, 0.7, 0.3), sample("n2", false, 0.9, 0.1)];
    const s = suggest(scope, xs, sweep(scope, xs), budget);
    expect(s.kind).toBe("separable_midpoint");
    expect(s.t).toBeCloseTo(0.55, 6);
  });

  it("maximises recall inside the false-block budget when the classes overlap", () => {
    const xs = [
      ...Array.from({ length: 10 }, (_, i) => sample(`n${i}`, false, 0.05 + i * 0.03)),
      ...Array.from({ length: 10 }, (_, i) => sample(`p${i}`, true, 0.2 + i * 0.08)),
    ];
    const s = suggest(injection, xs, sweep(injection, xs), 0.1);
    expect(s.kind).toBe("budgeted_recall");
    expect(s.point?.falseBlockRate ?? 1).toBeLessThanOrEqual(0.1 + 1e-12);
    const best = Math.max(...sweep(injection, xs).filter((p) => (p.falseBlockRate ?? 1) <= 0.1).map((p) => p.recall ?? 0));
    expect(s.point?.recall).toBeCloseTo(best, 9);
  });

  it("falls back to the best trade-off when nothing fits the budget", () => {
    const xs = [sample("n1", false, 0.9), sample("n2", false, 0.8), sample("p1", true, 0.85), sample("p2", true, 0.1)];
    const s = suggest(injection, xs, sweep(injection, xs), 0);
    expect(["max_youden", "budgeted_recall"]).toContain(s.kind);
    expect(s.t).not.toBeNull();
  });

  it("says so when there is nothing to fit", () => {
    expect(suggest(injection, [sample("n", false, 0.1)], sweep(injection, [sample("n", false, 0.1)]), budget).kind).toBe("no_positives");
    expect(suggest(injection, [sample("p", true, 0.9)], sweep(injection, [sample("p", true, 0.9)]), budget).kind).toBe("no_negatives");
  });
});

describe("calibration", () => {
  it("bins every sample once and reports the gap between predicted and observed", () => {
    const xs = [sample("a", false, 0.05), sample("b", false, 0.15), sample("c", true, 0.55), sample("d", true, 0.95), sample("e", true, 1)];
    const c = calibration(xs, 5);
    expect(c.bins).toHaveLength(5);
    expect(c.bins.reduce((n, b) => n + b.n, 0)).toBe(5);
    expect(c.bins[0]?.positiveRate).toBe(0);
    expect(c.bins[4]?.n).toBe(2);
    expect(c.ece).toBeGreaterThanOrEqual(0);
    expect(c.ece).toBeLessThanOrEqual(1);
  });

  it("has no ECE without samples", () => {
    expect(calibration([], 5).ece).toBeNull();
  });

  it("partitions any sample set (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 60 }), (vs) => {
        const c = calibration(vs.map((v, i) => sample(`s${i}`, i % 2 === 0, v)), 5);
        expect(c.bins.reduce((n, b) => n + b.n, 0)).toBe(vs.length);
      }),
    );
  });
});

describe("distributionByLabel", () => {
  it("summarises the risk score per label in the question's own label order", () => {
    const results = [
      row("a", { injection_risk: "injection" }, { clean: 0.2 }),
      row("b", { injection_risk: "clean" }, { clean: 0.8 }),
      row("c", { injection_risk: "clean" }, { clean: 0.6 }),
      row("d", { injection_risk: "injection" }, null),
    ];
    const d = distributionByLabel(injection, results);
    expect(d.map((x) => x.label)).toEqual(["clean", "suspicious", "injection"]);
    expect(d[0]?.summary?.n).toBe(2);
    expect(d[0]?.summary?.mean).toBeCloseTo(0.3, 9);
    expect(d[1]?.summary).toBeNull();
    expect(d[2]?.summary?.n).toBe(1);
  });
});
