// T-R1 parity: the fake that other lanes test against (FakeRail in @laisee/core/testing) and the real SIMULATED
// rail must agree on the shared F1 semantics, so swapping one for the other changes no outcome.
// Not covered here because the two differ on purpose: id formats, schema strictness of the decision, the packet
// remaining check (RailSim only), key reuse with different parameters (RailSim refuses, FakeRail replays), amount
// zero, and the state shown on a repeat mint.
import type { RailPort } from "@laisee/core/ports";
import { FakeRail } from "@laisee/core/testing";
import { describe, expect, it } from "vitest";
import { RailSim, seededRandom } from "../src";
import { MERCHANT, NOW, approvedDecision, decisionId, deniedDecision } from "./helpers";

// Both rails get the same explicit limits (test values, not register rows), so only the semantics are compared.
const LIMITS = { ceilingMinor: 100_000, maxActive: 2, maxTtlMs: 10 * 60_000 };
const factories: [string, () => RailPort & { cards: readonly { id: string; handle: string; state: string }[] }][] = [
  ["FakeRail", () => new FakeRail(LIMITS)],
  ["RailSim", () => new RailSim({ ...LIMITS, random: seededRandom(3) })],
];

describe.each(factories)("%s: shared F1 semantics", (_name, make) => {
  const mintOne = async (rail: RailPort, n: number, totalMinor: number, extra: { merchantLock?: string; purpose?: string; ttlMs?: number } = {}) =>
    rail.mint({ decision: approvedDecision({ id: decisionId(n), totalMinor, remainingMinor: 3 * LIMITS.ceilingMinor }), ttlMs: extra.ttlMs ?? LIMITS.maxTtlMs, now: NOW, ...extra });
  const pay = (rail: RailPort, handle: string, amountMinor: number, key: string, domain = MERCHANT) =>
    rail.authorise({ handle, amountMinor, merchantDomain: domain, now: NOW, idempotencyKey: key });
  const code = async (p: Promise<unknown>): Promise<string> => p.then(() => "OK", (e: { code?: string }) => e.code ?? "THROWN");

  it("mints the approved total as an ACTIVE SIMULATED card", async () => {
    const card = await mintOne(make(), 1, 25_900, { merchantLock: MERCHANT, purpose: "crt_test000001" });
    expect(card).toMatchObject({ limit_minor: 25_900, state: "ACTIVE", simulated: true, currency: "HKD", merchant_lock: MERCHANT, purpose: "crt_test000001" });
    expect(card.expires_at).toBe(new Date(NOW.getTime() + LIMITS.maxTtlMs).toISOString());
  });

  it("refuses to mint for a DENY, above the ceiling, a third active card, or a TTL above the card TTL", async () => {
    const rail = make();
    expect(await code(rail.mint({ decision: deniedDecision(), ttlMs: LIMITS.maxTtlMs, now: NOW }))).toBe("NOT_APPROVED");
    expect(await code(mintOne(rail, 1, LIMITS.ceilingMinor + 1))).toBe("OVER_CEILING");
    expect(await code(mintOne(rail, 2, 1_000, { ttlMs: LIMITS.maxTtlMs + 1 }))).toBe("TTL_TOO_LONG");
    await mintOne(rail, 3, 1_000);
    await mintOne(rail, 4, 1_000);
    expect(await code(mintOne(rail, 5, 1_000))).toBe("MAX_ACTIVE");
  });

  it("is idempotent by decision: a repeat returns the card, different terms are ALREADY_MINTED", async () => {
    const rail = make();
    const first = await mintOne(rail, 1, 5_000, { merchantLock: MERCHANT });
    expect(await mintOne(rail, 1, 5_000, { merchantLock: MERCHANT })).toEqual(first);
    expect(await code(mintOne(rail, 1, 5_000, { merchantLock: "other-shop.example" }))).toBe("ALREADY_MINTED");
    expect(rail.cards).toHaveLength(1);
  });

  it("holds the limit, authorises once, blocks the replay, honours the merchant lock and the key", async () => {
    const rail = make();
    const card = await mintOne(rail, 1, 25_900, { merchantLock: MERCHANT });
    expect(await pay(rail, card.handle, 25_901, "k1")).toMatchObject({ event: "DECLINED", decline_code: "OVER_LIMIT" });
    expect(await pay(rail, card.handle, 25_900, "k2", "other-shop.example")).toMatchObject({ decline_code: "MERCHANT_MISMATCH" });
    const ok = await pay(rail, card.handle, 25_900, "k3");
    expect(ok).toMatchObject({ event: "AUTHORISED", amount_minor: 25_900, idempotency_key: "k3", simulated: true });
    expect(await pay(rail, card.handle, 25_900, "k3")).toEqual(ok);
    expect(await pay(rail, card.handle, 25_900, "k4")).toMatchObject({ decline_code: "CARD_USED" });
    expect(await pay(rail, "hdl_neverIssuedByThisRail", 100, "k5")).toMatchObject({ decline_code: "UNKNOWN_HANDLE" });
  });

  it("voids and expires ACTIVE cards only", async () => {
    const rail = make();
    const a = await mintOne(rail, 1, 1_000);
    const b = await mintOne(rail, 2, 2_000);
    expect(await rail.void(a.id, NOW)).toMatchObject({ event: "VOIDED", card_id: a.id, simulated: true });
    await expect(rail.void(a.id, NOW)).rejects.toThrow();
    expect(await pay(rail, a.handle, 1_000, "kv")).toMatchObject({ decline_code: "CARD_VOIDED" });
    expect(await rail.expireDue(NOW)).toEqual([]);
    const later = new Date(NOW.getTime() + LIMITS.maxTtlMs);
    expect(await rail.expireDue(later)).toEqual([{ card_id: b.id, event: "EXPIRED", at: later.toISOString(), simulated: true }]);
    expect(await pay(rail, b.handle, 2_000, "ke")).toMatchObject({ decline_code: "CARD_EXPIRED" });
  });
});
