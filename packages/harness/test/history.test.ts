// The seeded history is a run of logged APPROVEs, so the verifier (step 9) holds each past purchase to the sealed terms:
// it fits the per-purchase terms and happens while the mandate is valid. historyOf makes the history that way.
import { describe, expect, it } from "vitest";
import { historyOf } from "../src/scenario/history";
import type { HistoryEvent } from "../src/types";

const BASE = { tag: "t1", budgetMinor: 80_000, remainingMinor: 20_000, activeCardLimits: [], mintAgesS: [], revoked: false };
const spentOf = (events: readonly HistoryEvent[]): readonly number[] => events.flatMap((e) => (e.kind === "spent" ? [e.amountMinor] : []));
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

describe("historyOf: the money spent", () => {
  it("is one purchase when the terms allow it", () => {
    expect(spentOf(historyOf(BASE))).toEqual([60_000]);
    expect(spentOf(historyOf({ ...BASE, perPurchase: { hardCapMinor: 60_000, askAboveMinor: 60_000, shareBp: 10_000 } }))).toEqual([60_000]);
  });

  it("is split into purchases that each fit the hard cap and ask-above, and still adds up", () => {
    for (const perPurchase of [{ hardCapMinor: 22_100 }, { askAboveMinor: 13_900 }, { hardCapMinor: 21_500, askAboveMinor: 12_900 }]) {
      const amounts = spentOf(historyOf({ ...BASE, perPurchase }));
      const limit = Math.min(perPurchase.hardCapMinor ?? Infinity, perPurchase.askAboveMinor ?? Infinity);
      expect(amounts.length).toBeGreaterThan(1);
      expect(Math.max(...amounts)).toBeLessThanOrEqual(limit);
      expect(sum(amounts)).toBe(60_000);
    }
  });

  it("takes each share of the remaining from what was left before that purchase", () => {
    const amounts = spentOf(historyOf({ ...BASE, perPurchase: { shareBp: 3_000 } }));
    let remaining = BASE.budgetMinor;
    for (const amount of amounts) {
      expect(amount).toBeLessThanOrEqual(Math.floor((remaining * 3_000) / 10_000));
      remaining -= amount;
    }
    expect(sum(amounts)).toBe(60_000);
    expect(remaining).toBe(BASE.remainingMinor);
  });

  it("gives each purchase its own card, charged one after the other", () => {
    const events = historyOf({ ...BASE, perPurchase: { hardCapMinor: 15_000 } });
    const spent = events.filter((e) => e.kind === "spent");
    expect(new Set(spent.map((e) => e.kind === "spent" && e.cardId)).size).toBe(spent.length);
    expect(events.map((e) => e.agoS)).toEqual([...events.map((e) => e.agoS)].sort((a, b) => b - a)); // oldest first
  });

  it("refuses money the terms can never let out (a share never empties the budget)", () => {
    expect(() => historyOf({ ...BASE, remainingMinor: 0, perPurchase: { shareBp: 5_000 } })).toThrow(RangeError);
  });
});

describe("historyOf: while the mandate is valid", () => {
  const DAYS_S = 10 * 86_400;

  it("keeps the times of a mandate that has not ended, or ended after the history", () => {
    const events = historyOf({ ...BASE, endedAgoS: -3_600 });
    expect(events).toEqual(historyOf(BASE));
    expect(historyOf({ ...BASE, endedAgoS: 60 })).toEqual(historyOf(BASE));
  });

  it("moves the whole history to before the end of a mandate that ended long ago", () => {
    const events = historyOf({ ...BASE, activeCardLimits: [5_000], endedAgoS: DAYS_S });
    expect(events.length).toBeGreaterThan(1);
    for (const e of events) expect(e.agoS).toBeGreaterThan(DAYS_S);
    expect(events.map((e) => e.agoS)).toEqual(historyOf({ ...BASE, activeCardLimits: [5_000] }).map((e) => e.agoS + DAYS_S));
  });
});
