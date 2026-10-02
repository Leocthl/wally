// T-R1 (F1 parity for authorise): single use, blocked replay, limit held, idempotency, merchant lock.
import { validateCardEvent } from "@laisee/core/schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RailSimError } from "../src";
import { MERCHANT, MINUTE_MS, NOW, TTL_30_MIN, mintCard, pay } from "./helpers";

const LIMIT = 25_900;

describe("authorise: single use [F1]", () => {
  it("authorises the exact limit, marks the card USED, and every later attempt is a blocked replay", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    const ok = await pay(rail, card, LIMIT, { key: "chk_1" });
    expect(validateCardEvent(ok).ok).toBe(true);
    expect(ok).toEqual({
      card_id: card.id,
      event: "AUTHORISED",
      at: NOW.toISOString(),
      amount_minor: LIMIT,
      merchant_domain: MERCHANT,
      idempotency_key: "chk_1",
      simulated: true,
    });
    expect(rail.card(card.id)?.state).toBe("USED");
    for (const amount of [LIMIT, 1, LIMIT + 1]) {
      const replay = await pay(rail, card, amount);
      expect(replay).toMatchObject({ event: "DECLINED", decline_code: "CARD_USED", card_id: card.id, simulated: true });
      expect(validateCardEvent(replay).ok).toBe(true);
    }
    expect(rail.authorisations()).toHaveLength(1);
  });

  it("DM2: an overshoot is declined OVER_LIMIT, the limit is held, then the exact charge succeeds", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    const declined = await pay(rail, card, LIMIT + 1);
    expect(declined).toMatchObject({ event: "DECLINED", decline_code: "OVER_LIMIT", amount_minor: LIMIT + 1 });
    expect(rail.card(card.id)?.state).toBe("ACTIVE");
    expect(rail.ledger(card.id)).toMatchObject({ settled_minor: 0, held_minor: LIMIT, released_minor: 0 });
    expect(await pay(rail, card, LIMIT)).toMatchObject({ event: "AUTHORISED", amount_minor: LIMIT });
  });

  it("a charge below the limit settles at the actual amount and the rest is released", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    const event = await pay(rail, card, 20_000);
    expect(event).toMatchObject({ event: "AUTHORISED", amount_minor: 20_000 });
    expect(rail.ledger(card.id)).toEqual({
      card_id: card.id,
      state: "USED",
      limit_minor: LIMIT,
      settled_minor: 20_000,
      held_minor: 0,
      released_minor: 5_900,
      simulated: true,
    });
    expect(await pay(rail, card, 5_900)).toMatchObject({ decline_code: "CARD_USED" });
  });

  it("rejects an amount of zero as a malformed request and leaves the card untouched", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    await expect(pay(rail, card, 0)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(rail.card(card.id)?.state).toBe("ACTIVE");
  });
});

describe("authorise: other declines", () => {
  it("CARD_VOIDED after a void", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    await rail.void(card.id, NOW);
    expect(await pay(rail, card, LIMIT)).toMatchObject({ event: "DECLINED", decline_code: "CARD_VOIDED" });
  });

  it("CARD_EXPIRED once the TTL passes, even before expireDue ran", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    const justBefore = new Date(NOW.getTime() + TTL_30_MIN - 1);
    const atExpiry = new Date(NOW.getTime() + TTL_30_MIN);
    expect(await pay(rail, card, LIMIT + 1, { now: justBefore })).toMatchObject({ decline_code: "OVER_LIMIT" });
    expect(await pay(rail, card, LIMIT, { now: atExpiry })).toMatchObject({ event: "DECLINED", decline_code: "CARD_EXPIRED" });
    expect(rail.card(card.id)?.state).toBe("ACTIVE");
  });

  it("CARD_EXPIRED after expireDue", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    await rail.expireDue(new Date(NOW.getTime() + TTL_30_MIN));
    expect(await pay(rail, card, LIMIT)).toMatchObject({ decline_code: "CARD_EXPIRED" });
  });

  it("UNKNOWN_HANDLE for a handle the rail never issued", async () => {
    const { rail } = await mintCard({}, { totalMinor: LIMIT });
    const event = await pay(rail, { handle: "hdl_neverIssuedByThisRail" }, LIMIT);
    expect(event).toMatchObject({ event: "DECLINED", decline_code: "UNKNOWN_HANDLE", card_id: "crd_unknown" });
    expect(validateCardEvent(event).ok).toBe(true);
  });

  it("MERCHANT_MISMATCH only when a lock is set (SIMULATED feature; the real card has none [F1])", async () => {
    const locked = await mintCard({}, { totalMinor: LIMIT }, { merchantLock: MERCHANT });
    expect(await pay(locked.rail, locked.card, LIMIT, { domain: "other-shop.example" })).toMatchObject({
      event: "DECLINED",
      decline_code: "MERCHANT_MISMATCH",
      merchant_domain: "other-shop.example",
    });
    expect(locked.rail.card(locked.card.id)?.state).toBe("ACTIVE");
    expect(await pay(locked.rail, locked.card, LIMIT)).toMatchObject({ event: "AUTHORISED" });

    const open = await mintCard({}, { totalMinor: LIMIT });
    expect(await pay(open.rail, open.card, LIMIT, { domain: "other-shop.example" })).toMatchObject({ event: "AUTHORISED" });
  });

  it("decline precedence: used > voided > expired > merchant mismatch > over limit", async () => {
    const used = await mintCard({}, { totalMinor: LIMIT }, { merchantLock: MERCHANT });
    await pay(used.rail, used.card, LIMIT);
    expect(await pay(used.rail, used.card, LIMIT + 1, { domain: "other-shop.example", now: new Date(NOW.getTime() + TTL_30_MIN) })).toMatchObject({
      decline_code: "CARD_USED",
    });

    const voided = await mintCard({}, { totalMinor: LIMIT }, { merchantLock: MERCHANT });
    await voided.rail.void(voided.card.id, NOW);
    expect(await pay(voided.rail, voided.card, LIMIT + 1, { now: new Date(NOW.getTime() + TTL_30_MIN) })).toMatchObject({ decline_code: "CARD_VOIDED" });

    const lateWrong = await mintCard({}, { totalMinor: LIMIT }, { merchantLock: MERCHANT });
    expect(await pay(lateWrong.rail, lateWrong.card, LIMIT + 1, { domain: "other-shop.example", now: new Date(NOW.getTime() + TTL_30_MIN) })).toMatchObject({
      decline_code: "CARD_EXPIRED",
    });

    const wrongAndOver = await mintCard({}, { totalMinor: LIMIT }, { merchantLock: MERCHANT });
    expect(await pay(wrongAndOver.rail, wrongAndOver.card, LIMIT + 1, { domain: "other-shop.example" })).toMatchObject({
      decline_code: "MERCHANT_MISMATCH",
    });
  });
});

describe("authorise: idempotency keys never charge twice (F19 failure injection)", () => {
  it("a retry with the same key returns the same CardEvent and charges once", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    const first = await pay(rail, card, LIMIT, { key: "chk_retry" });
    const retry = await pay(rail, card, LIMIT, { key: "chk_retry", now: new Date(NOW.getTime() + 5_000) });
    expect(retry).toEqual(first);
    expect(rail.authorisations()).toHaveLength(1);
    expect(rail.ledger(card.id)?.settled_minor).toBe(LIMIT);
  });

  it("a declined attempt is replayed from the key too, and does not use up the card", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    const first = await pay(rail, card, LIMIT + 1, { key: "chk_over" });
    expect(await pay(rail, card, LIMIT + 1, { key: "chk_over" })).toEqual(first);
    expect(await pay(rail, card, LIMIT, { key: "chk_exact" })).toMatchObject({ event: "AUTHORISED" });
  });

  it("two concurrent authorises with the same key produce one charge and equal events", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => pay(rail, card, LIMIT, { key: "chk_race" })));
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a).toMatchObject({ event: "AUTHORISED" });
    expect(rail.authorisations()).toHaveLength(1);
  });

  it("two concurrent authorises with different keys: exactly one wins, the other is CARD_USED", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    const events = await Promise.all([pay(rail, card, LIMIT, { key: "chk_a" }), pay(rail, card, LIMIT, { key: "chk_b" })]);
    expect(events.filter((e) => e.event === "AUTHORISED")).toHaveLength(1);
    expect(events.filter((e) => e.decline_code === "CARD_USED")).toHaveLength(1);
    expect(rail.authorisations()).toHaveLength(1);
  });

  it("reusing a key with different parameters is refused, not answered with the old event", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    await pay(rail, card, LIMIT, { key: "chk_reuse" });
    await expect(pay(rail, card, LIMIT - 1, { key: "chk_reuse" })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    await expect(pay(rail, card, LIMIT, { key: "chk_reuse", domain: "other-shop.example" })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("rejects malformed requests without touching the card", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    const bad = [
      { key: "has space" },
      { key: "" },
      { key: "k".repeat(65) },
      { domain: "Not A Domain" },
    ];
    for (const extra of bad) await expect(pay(rail, card, LIMIT, extra)).rejects.toBeInstanceOf(RailSimError);
    for (const amount of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      await expect(pay(rail, card, amount)).rejects.toBeInstanceOf(RailSimError);
    }
    await expect(rail.authorise({ handle: card.handle, amountMinor: LIMIT, merchantDomain: MERCHANT, now: new Date(Number.NaN), idempotencyKey: "k_nan" })).rejects.toBeInstanceOf(RailSimError);
    expect(rail.card(card.id)?.state).toBe("ACTIVE");
    expect(rail.authorisations()).toHaveLength(0);
  });
});

describe("authorise: properties", () => {
  it("never authorises above the limit, and at most one AUTHORISED per card (T-I2 on the rail)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100_000 }),
        fc.array(fc.integer({ min: 1, max: 150_000 }), { minLength: 1, maxLength: 8 }),
        async (limit, amounts) => {
          const { rail, card } = await mintCard({}, { totalMinor: limit, remainingMinor: 100_000 });
          const events = [];
          for (const [i, amount] of amounts.entries()) events.push(await pay(rail, card, amount, { key: `p_${i}` }));
          const authorised = events.filter((e) => e.event === "AUTHORISED");
          expect(authorised.length).toBeLessThanOrEqual(1);
          for (const e of authorised) expect(e.amount_minor).toBeLessThanOrEqual(limit);
          const firstFit = amounts.findIndex((a) => a <= limit);
          if (firstFit >= 0) expect(events[firstFit]?.event).toBe("AUTHORISED");
          events.forEach((e, i) => {
            if (i === firstFit) return;
            expect(e.event).toBe("DECLINED");
            expect(e.decline_code).toBe(firstFit >= 0 && i > firstFit ? "CARD_USED" : "OVER_LIMIT");
          });
          const ledger = rail.ledger(card.id);
          expect((ledger?.settled_minor ?? 0) + (ledger?.held_minor ?? 0) + (ledger?.released_minor ?? 0)).toBe(limit);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("stays deterministic whatever the clock does after expiry", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    const later = new Date(NOW.getTime() + 24 * 60 * MINUTE_MS);
    expect(await pay(rail, card, LIMIT, { now: later })).toMatchObject({ decline_code: "CARD_EXPIRED" });
  });
});
