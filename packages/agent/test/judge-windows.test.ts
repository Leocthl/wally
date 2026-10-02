import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { combineWindowAnswers, splitListing, type WindowingOptions } from "../src/judge/windows";
import { answers } from "./support/fit-data";

const opts: WindowingOptions = { windowChars: 100, overlapChars: 20, maxWindows: 6 };

describe("splitListing", () => {
  it("keeps a short listing whole, as one part", () => {
    const plan = splitListing("short text", opts);
    expect(plan).toEqual({ ok: true, parts: [{ text: "short text", index: 0, total: 1 }] });
  });

  it("splits a long listing into overlapping windows that carry their position", () => {
    const text = "a".repeat(250);
    const plan = splitListing(text, opts);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.parts.map((p) => [p.index, p.total, p.text.length])).toEqual([[0, 3, 100], [1, 3, 100], [2, 3, 90]]);
  });

  it("refuses a listing that would need more windows than allowed, instead of judging part of it", () => {
    expect(splitListing("x".repeat(10_000), opts)).toEqual({ ok: false, reason: "too_many_windows" });
  });

  it("never splits a surrogate pair", () => {
    const text = "😀".repeat(120);
    const plan = splitListing(text, opts);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    for (const p of plan.parts) {
      expect(p.text.codePointAt(0)).toBeDefined();
      expect(/^[\uDC00-\uDFFF]/.test(p.text)).toBe(false);
      expect(/[\uD800-\uDBFF]$/.test(p.text)).toBe(false);
    }
  });

  it("covers every character, keeps windows within bounds and overlaps neighbours (property)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 480 }), (text) => {
        const plan = splitListing(text, opts);
        if (!plan.ok) return;
        const { parts } = plan;
        expect(parts.length).toBeGreaterThanOrEqual(1);
        expect(parts.every((p, i) => p.index === i && p.total === parts.length && p.text.length <= opts.windowChars)).toBe(true);
        // The windows, laid over the text with the overlap they were cut with, rebuild it exactly.
        const rebuilt = parts.reduce((acc, p, i) => (i === 0 ? p.text : acc + p.text.slice(Math.min(p.text.length, overlapUsed(acc, p.text)))), "");
        expect(rebuilt).toBe(text);
      }),
      { numRuns: 300 },
    );
  });

  it("is deterministic", () => {
    const text = "word ".repeat(80);
    expect(splitListing(text, opts)).toEqual(splitListing(text, opts));
  });

  it("puts any sentence shorter than the overlap whole into at least one window (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 380 }), (at) => {
        const needle = "ORDER";
        const text = "x".repeat(at) + needle + "x".repeat(400 - at);
        const plan = splitListing(text, opts);
        expect(plan.ok).toBe(true);
        if (plan.ok) expect(plan.parts.some((p) => p.text.includes(needle))).toBe(true);
      }),
    );
  });
});

/** Length of the longest suffix of `acc` that is a prefix of `next`, capped at the overlap the splitter uses. */
function overlapUsed(acc: string, next: string): number {
  for (let k = Math.min(opts.overlapChars, acc.length, next.length); k > 0; k -= 1) if (acc.endsWith(next.slice(0, k))) return k;
  return 0;
}

describe("combineWindowAnswers: the worst window decides every question", () => {
  const calm = answers({ in_scope: 0.7, clean: 0.8, high_risk: 0.2, escalate: 0.2 });
  const dirty = answers({ in_scope: 0.4, clean: 0.2, high_risk: 0.7, escalate: 0.6 });

  it("takes every question from its worst window, scope_fit included (the most in-scope window never decides)", () => {
    const merged = combineWindowAnswers([calm, dirty]);
    expect(merged.injection_risk).toEqual(dirty.injection_risk);
    expect(merged.seller_risk).toEqual(dirty.seller_risk);
    expect(merged.escalate_or_proceed).toEqual(dirty.escalate_or_proceed);
    expect(merged.scope_fit).toEqual(dirty.scope_fit);
  });

  it("returns a single window unchanged", () => {
    expect(combineWindowAnswers([calm])).toEqual(calm);
  });

  it("only ever returns whole distributions from a window, so each still sums to 1 (property)", () => {
    const one = fc.record({
      in_scope: fc.double({ min: 0, max: 1, noNaN: true }),
      clean: fc.double({ min: 0, max: 1, noNaN: true }),
      high_risk: fc.double({ min: 0, max: 1, noNaN: true }),
      escalate: fc.double({ min: 0, max: 1, noNaN: true }),
    });
    fc.assert(
      fc.property(fc.array(one, { minLength: 1, maxLength: 5 }), (ps) => {
        const list = ps.map((p) => answers(p));
        const merged = combineWindowAnswers(list);
        for (const q of ["scope_fit", "injection_risk", "seller_risk", "escalate_or_proceed"] as const) {
          expect(list.some((a) => JSON.stringify(a[q]) === JSON.stringify(merged[q]))).toBe(true);
        }
        const worstInj = Math.max(...list.map((a) => a.injection_risk.suspicious + a.injection_risk.injection));
        expect(merged.injection_risk.suspicious + merged.injection_risk.injection).toBeCloseTo(worstInj, 9);
        expect(merged.scope_fit.in_scope).toBeCloseTo(Math.min(...list.map((a) => a.scope_fit.in_scope)), 9);
        expect(merged.seller_risk.high_risk).toBeCloseTo(Math.max(...list.map((a) => a.seller_risk.high_risk)), 9);
      }),
    );
  });

  it("throws nothing on an empty list: the caller never passes one, and the fallback is the first window's absence", () => {
    expect(() => combineWindowAnswers([])).toThrow();
  });
});
