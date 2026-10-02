// T-I8 on the rail: no PAN-like digit run, no CVV or expiry field, an opaque handle and a masked last4 only.
// Also the id and random sources (injectable, deterministic).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RailSim, createIdSource, cryptoRandom, seededRandom, sequentialIds } from "../src";
import { MERCHANT, NOW, PAN_LIKE, TTL_30_MIN, approvedDecision, decisionId, makeRail, pay } from "./helpers";

const FORBIDDEN_KEYS = /^(pan|cvv|cvc|cvv2|card_?number|number|expiry|exp|exp_?month|exp_?year|security_?code|track)$/i;

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [k, ...keysOf(v)]);
  }
  return [];
}

function longestDigitRun(text: string): number {
  return Math.max(0, ...(text.match(/\d+/g) ?? []).map((run) => run.length));
}

describe("T-I8: nothing the rail emits looks like a card", () => {
  it("across mint, authorise, decline, void and expiry, outputs carry no PAN-like run and no card-detail field", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 200_000 }),
        fc.integer({ min: 1, max: 300_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        async (total, charge, seed) => {
          const rail = makeRail({}, seed);
          const decision = approvedDecision({ totalMinor: total, remainingMinor: 400_000 });
          const card = await rail.mint({ decision, ttlMs: TTL_30_MIN, now: NOW, merchantLock: MERCHANT, purpose: decision.cart.id });
          const outputs: unknown[] = [card];
          outputs.push(await pay(rail, card, charge));
          outputs.push(await pay(rail, card, charge, { domain: "other-shop.example" }));
          outputs.push(await pay(rail, { handle: "hdl_unknownHandleForTest" }, charge));
          outputs.push(rail.ledger(card.id), rail.cards, rail.authorisations());
          for (const code of ["OVER_LIMIT", "CARD_USED", "CARD_VOIDED", "CARD_EXPIRED", "UNKNOWN_HANDLE", "MERCHANT_MISMATCH"] as const) {
            outputs.push(rail.declineInfo(code));
          }
          const text = JSON.stringify(outputs);
          expect(PAN_LIKE.test(text)).toBe(false);
          expect(keysOf(outputs).filter((k) => FORBIDDEN_KEYS.test(k))).toEqual([]);
          expect(JSON.stringify(card)).not.toMatch(/cvv/i);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("void and expiry events are label-only too", async () => {
    const rail = makeRail();
    const card = await rail.mint({ decision: approvedDecision({ id: decisionId(1), totalMinor: 1_000 }), ttlMs: TTL_30_MIN, now: NOW });
    const voided = await rail.void(card.id, NOW);
    const second = await rail.mint({ decision: approvedDecision({ id: decisionId(2), totalMinor: 1_000 }), ttlMs: TTL_30_MIN, now: NOW });
    const expired = await rail.expireDue(new Date(NOW.getTime() + TTL_30_MIN));
    expect(second.id).toBe(expired[0]?.card_id);
    expect(PAN_LIKE.test(JSON.stringify([voided, expired]))).toBe(false);
    expect(keysOf([voided, expired]).filter((k) => FORBIDDEN_KEYS.test(k))).toEqual([]);
  });

  it("the handle is opaque: never a digits-only run long enough to pass for a card number", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 1_000_000 }), async (seed) => {
        const ids = createIdSource(seededRandom(seed));
        for (let i = 0; i < 20; i += 1) {
          expect(longestDigitRun(ids.handle())).toBeLessThan(13);
          expect(longestDigitRun(ids.cardId())).toBeLessThan(13);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("id and random sources", () => {
  it("create ids that satisfy the schema patterns", () => {
    const ids = createIdSource(seededRandom(1));
    for (let i = 0; i < 50; i += 1) {
      expect(ids.cardId()).toMatch(/^crd_[A-Za-z0-9]{6,40}$/);
      expect(ids.handle()).toMatch(/^hdl_[A-Za-z0-9_-]{16,64}$/);
    }
  });

  it("the same seed gives the same sequence; different seeds differ", () => {
    const a = createIdSource(seededRandom(5));
    const b = createIdSource(seededRandom(5));
    const c = createIdSource(seededRandom(6));
    expect([a.cardId(), a.handle()]).toEqual([b.cardId(), b.handle()]);
    expect(a.cardId()).not.toBe(c.cardId());
  });

  it("nextInt stays inside [0, max) and rejects bad bounds", () => {
    const r = seededRandom(9);
    for (let i = 0; i < 1_000; i += 1) {
      const n = r.nextInt(10);
      expect(Number.isInteger(n) && n >= 0 && n < 10).toBe(true);
    }
    expect(() => r.nextInt(0)).toThrow(RangeError);
    expect(() => r.nextInt(1.5)).toThrow(RangeError);
    const crypto = cryptoRandom();
    for (let i = 0; i < 200; i += 1) expect(crypto.nextInt(7)).toBeLessThan(7);
  });

  it("the default (crypto) source mints distinct ids", async () => {
    const rail = new RailSim();
    const a = await rail.mint({ decision: approvedDecision({ id: decisionId(1), totalMinor: 1_000 }), ttlMs: TTL_30_MIN, now: NOW });
    const b = await rail.mint({ decision: approvedDecision({ id: decisionId(2), totalMinor: 1_000 }), ttlMs: TTL_30_MIN, now: NOW });
    expect(a.id).not.toBe(b.id);
    expect(a.handle).not.toBe(b.handle);
  });

  it("an injected id source is used as given, and a colliding source fails closed", async () => {
    const rail = new RailSim({ random: seededRandom(1), ids: sequentialIds() });
    const a = await rail.mint({ decision: approvedDecision({ id: decisionId(1), totalMinor: 1_000 }), ttlMs: TTL_30_MIN, now: NOW });
    expect(a.id).toBe("crd_sim000001");
    expect(a.handle).toMatch(/^hdl_SIMULATED/);
    const stuck = new RailSim({ random: seededRandom(1), ids: { cardId: () => "crd_samesame1", handle: () => "hdl_sameSameSameSame1" } });
    await stuck.mint({ decision: approvedDecision({ id: decisionId(1), totalMinor: 1_000 }), ttlMs: TTL_30_MIN, now: NOW });
    await expect(stuck.mint({ decision: approvedDecision({ id: decisionId(2), totalMinor: 1_000 }), ttlMs: TTL_30_MIN, now: NOW })).rejects.toMatchObject({ code: "INTERNAL" });
  });
});
