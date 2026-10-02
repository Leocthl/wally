// T-R1 (F1 parity for mint), T-I1 and T-I2 on the SIMULATED rail.
import { MintError } from "@laisee/core/ports";
import { validateCardRecord } from "@laisee/core/schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RAIL_SIM_DEFAULTS, RailSim, RailSimError, seededRandom } from "../src";
import {
  MERCHANT,
  MINUTE_MS,
  NOW,
  TTL_30_MIN,
  approvedDecision,
  decisionId,
  deniedDecision,
  escalatedDecision,
  makeRail,
  mintCard,
} from "./helpers";

const DAY_MS = 24 * 60 * MINUTE_MS;

async function mintCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (err) {
    return err instanceof MintError ? err.code : `OTHER:${String(err)}`;
  }
}

describe("rail defaults come from F1 and F30", () => {
  it("pins ceiling, active maximum, card TTL and validity", () => {
    expect(RAIL_SIM_DEFAULTS).toEqual({ ceilingMinor: 200_000, maxActive: 2, maxTtlMs: 30 * MINUTE_MS, validityMonths: 2 });
  });
});

describe("mint: one single-use card per APPROVE (F1, I1, I2)", () => {
  it("mints exactly the approved total as a schema-valid SIMULATED CardRecord", async () => {
    const { card, decision } = await mintCard({}, { totalMinor: 25_900 }, { merchantLock: MERCHANT, purpose: "crt_test000001" });
    expect(validateCardRecord(card).ok).toBe(true);
    expect(card).toMatchObject({
      decision_id: decision.id,
      mandate_id: decision.mandate_id,
      limit_minor: 25_900,
      currency: "HKD",
      state: "ACTIVE",
      simulated: true,
      merchant_lock: MERCHANT,
      purpose: "crt_test000001",
      minted_at: NOW.toISOString(),
      expires_at: new Date(NOW.getTime() + TTL_30_MIN).toISOString(),
    });
    expect(card.handle).toMatch(/^hdl_[A-Za-z0-9_-]{16,64}$/);
    expect(card.last4).toMatch(/^[0-9]{4}$/);
  });

  it("omits merchant_lock and purpose when not requested", async () => {
    const { card } = await mintCard();
    expect(card).not.toHaveProperty("merchant_lock");
    expect(card).not.toHaveProperty("purpose");
  });

  it("never mints for DENY, ESCALATE or a missing limit (NOT_APPROVED)", async () => {
    const rail = makeRail();
    const req = { ttlMs: TTL_30_MIN, now: NOW };
    expect(await mintCode(rail.mint({ ...req, decision: deniedDecision() }))).toBe("NOT_APPROVED");
    expect(await mintCode(rail.mint({ ...req, decision: escalatedDecision() }))).toBe("NOT_APPROVED");
    const { approved_limit_minor: _limit, ...noLimit } = approvedDecision();
    expect(await mintCode(rail.mint({ ...req, decision: noLimit as never }))).toBe("NOT_APPROVED");
    expect(rail.cards).toHaveLength(0);
  });

  it("fails closed on malformed or inconsistent decisions (NOT_APPROVED)", async () => {
    const rail = makeRail();
    const req = { ttlMs: TTL_30_MIN, now: NOW };
    const ok = approvedDecision({ totalMinor: 10_000 });
    const cases: unknown[] = [
      undefined,
      null,
      {},
      { ...ok, approved_limit_minor: 9_999 }, // limit != cart total (I2)
      { ...ok, approved_limit_minor: 0, cart: { ...ok.cart, total_minor: 0 } },
      { ...ok, packet: { ...ok.packet, remaining_minor: 9_999 } }, // limit above packet remaining (I2)
      { ...ok, packet: { ...ok.packet, status: "REVOKED" } }, // I6 backstop
      { ...ok, packet: { ...ok.packet, status: "EXPIRED" } },
      { ...ok, mandate_id: "mnd_otherMandate1" },
    ];
    for (const decision of cases) {
      expect(await mintCode(rail.mint({ ...req, decision: decision as never }))).toBe("NOT_APPROVED");
    }
    expect(rail.cards).toHaveLength(0);
  });

  it("OVER_CEILING above HK$2,000 [F1], allowed exactly at the ceiling", async () => {
    const rail = makeRail();
    const at = approvedDecision({ id: decisionId(1), totalMinor: 200_000, remainingMinor: 300_000 });
    const over = approvedDecision({ id: decisionId(2), totalMinor: 200_001, remainingMinor: 300_000 });
    expect((await rail.mint({ decision: at, ttlMs: TTL_30_MIN, now: NOW })).limit_minor).toBe(200_000);
    expect(await mintCode(rail.mint({ decision: over, ttlMs: TTL_30_MIN, now: NOW }))).toBe("OVER_CEILING");
    expect(rail.cards).toHaveLength(1);
  });

  it("MAX_ACTIVE at two ACTIVE cards [F1]; a used, voided or expired card frees a slot", async () => {
    const rail = makeRail();
    const mint = (n: number) => rail.mint({ decision: approvedDecision({ id: decisionId(n), totalMinor: 1_000 * n }), ttlMs: TTL_30_MIN, now: NOW });
    const first = await mint(1);
    const second = await mint(2);
    expect(await mintCode(mint(3))).toBe("MAX_ACTIVE");
    await rail.void(first.id, NOW);
    const third = await mint(3);
    expect(third.state).toBe("ACTIVE");
    expect(await mintCode(mint(4))).toBe("MAX_ACTIVE");
    await rail.authorise({ handle: second.handle, amountMinor: 2_000, merchantDomain: MERCHANT, now: NOW, idempotencyKey: "use_second" });
    expect((await mint(4)).state).toBe("ACTIVE");
  });

  it("an idempotent repeat still works while the rail is at MAX_ACTIVE", async () => {
    const rail = makeRail();
    const decisions = [1, 2].map((n) => approvedDecision({ id: decisionId(n), totalMinor: 1_000 }));
    const cards = [];
    for (const decision of decisions) cards.push(await rail.mint({ decision, ttlMs: TTL_30_MIN, now: NOW }));
    expect(await rail.mint({ decision: decisions[0]!, ttlMs: TTL_30_MIN, now: NOW })).toEqual(cards[0]);
    expect(rail.cards).toHaveLength(2);
  });
});

describe("mint: TTL = min(card TTL [F30], packet expiry, validity [F1])", () => {
  it("rejects a TTL above the card TTL (TTL_TOO_LONG)", async () => {
    const rail = makeRail();
    const decision = approvedDecision();
    expect(await mintCode(rail.mint({ decision, ttlMs: TTL_30_MIN + 1, now: NOW }))).toBe("TTL_TOO_LONG");
    expect(rail.cards).toHaveLength(0);
    expect((await rail.mint({ decision, ttlMs: TTL_30_MIN, now: NOW })).state).toBe("ACTIVE");
  });

  it("rejects a TTL that is not a positive integer (TTL_TOO_LONG, fail closed)", async () => {
    const rail = makeRail();
    for (const ttlMs of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(await mintCode(rail.mint({ decision: approvedDecision(), ttlMs, now: NOW }))).toBe("TTL_TOO_LONG");
    }
  });

  it("clamps the card expiry to the packet expiry", async () => {
    const packetExpiresAt = new Date(NOW.getTime() + 5 * MINUTE_MS).toISOString();
    const { card } = await mintCard({}, { packetExpiresAt });
    expect(card.expires_at).toBe(packetExpiresAt);
  });

  it("refuses to mint once the packet has expired (TTL_TOO_LONG)", async () => {
    const rail = makeRail();
    for (const packetExpiresAt of [NOW.toISOString(), new Date(NOW.getTime() - MINUTE_MS).toISOString()]) {
      const decision = approvedDecision({ packetExpiresAt });
      expect(await mintCode(rail.mint({ decision, ttlMs: MINUTE_MS, now: NOW }))).toBe("TTL_TOO_LONG");
    }
  });

  it("caps validity at two calendar months [F1] when the card TTL is configured higher", async () => {
    const rail = makeRail({ maxTtlMs: 90 * DAY_MS });
    const packetExpiresAt = "2027-01-31T00:00:00Z";
    const decision = approvedDecision({ packetExpiresAt });
    const twoMonths = Date.parse("2026-12-03T02:05:02Z") - NOW.getTime();
    expect(await mintCode(rail.mint({ decision, ttlMs: twoMonths + 1, now: NOW }))).toBe("TTL_TOO_LONG");
    const card = await rail.mint({ decision, ttlMs: twoMonths, now: NOW });
    expect(card.expires_at).toBe("2026-12-03T02:05:02.000Z");
  });

  it("clamps month-end validity (31 Dec plus two months is 28 Feb)", async () => {
    const rail = makeRail({ maxTtlMs: 90 * DAY_MS });
    const now = new Date("2026-12-31T00:00:00Z");
    const decision = approvedDecision({ packetExpiresAt: "2027-06-30T00:00:00Z" });
    const limit = Date.parse("2027-02-28T00:00:00Z") - now.getTime();
    expect(await mintCode(rail.mint({ decision, ttlMs: limit + 1, now }))).toBe("TTL_TOO_LONG");
    expect((await rail.mint({ decision, ttlMs: limit, now })).expires_at).toBe("2027-02-28T00:00:00.000Z");
  });
});

describe("mint: idempotent by decision.id", () => {
  it("a repeat returns the same CardRecord and mints nothing new", async () => {
    const rail = makeRail();
    const decision = approvedDecision();
    const req = { decision, ttlMs: TTL_30_MIN, now: NOW, merchantLock: MERCHANT, purpose: "crt_test000001" };
    const first = await rail.mint(req);
    const again = await rail.mint({ ...req, now: new Date(NOW.getTime() + 1_000) });
    expect(again).toEqual(first);
    expect(rail.cards).toHaveLength(1);
  });

  it("a repeat after the card was used still returns the record as minted (state ACTIVE)", async () => {
    const rail = makeRail();
    const decision = approvedDecision({ totalMinor: 1_000 });
    const first = await rail.mint({ decision, ttlMs: TTL_30_MIN, now: NOW });
    await rail.authorise({ handle: first.handle, amountMinor: 1_000, merchantDomain: MERCHANT, now: NOW, idempotencyKey: "used_once" });
    expect(await rail.mint({ decision, ttlMs: TTL_30_MIN, now: NOW })).toEqual(first);
    expect(rail.card(first.id)?.state).toBe("USED");
    expect(rail.cards).toHaveLength(1);
  });

  it("ALREADY_MINTED only when the repeat asks for different terms", async () => {
    const rail = makeRail();
    const decision = approvedDecision();
    const base = { decision, ttlMs: TTL_30_MIN, now: NOW, merchantLock: MERCHANT, purpose: "crt_test000001" };
    await rail.mint(base);
    expect(await mintCode(rail.mint({ ...base, merchantLock: "other-shop.example" }))).toBe("ALREADY_MINTED");
    expect(await mintCode(rail.mint({ ...base, purpose: "crt_test000002" }))).toBe("ALREADY_MINTED");
    const { merchantLock: _lock, ...noLock } = base;
    expect(await mintCode(rail.mint(noLock))).toBe("ALREADY_MINTED");
    const bigger = approvedDecision({ totalMinor: 30_000 });
    expect(await mintCode(rail.mint({ ...base, decision: { ...bigger, id: decision.id } }))).toBe("ALREADY_MINTED");
    expect(rail.cards).toHaveLength(1);
  });

  it("two concurrent mints for one decision produce one card", async () => {
    const rail = makeRail();
    const req = { decision: approvedDecision(), ttlMs: TTL_30_MIN, now: NOW };
    const [a, b] = await Promise.all([rail.mint(req), rail.mint(req)]);
    expect(a).toEqual(b);
    expect(rail.cards).toHaveLength(1);
  });

  it("a repeat does not consume the random source", async () => {
    const railA = makeRail({}, 99);
    const railB = makeRail({}, 99);
    const d1 = approvedDecision({ id: decisionId(1), totalMinor: 1_000 });
    const d2 = approvedDecision({ id: decisionId(2), totalMinor: 2_000 });
    await railA.mint({ decision: d1, ttlMs: TTL_30_MIN, now: NOW });
    await railA.mint({ decision: d1, ttlMs: TTL_30_MIN, now: NOW });
    await railB.mint({ decision: d1, ttlMs: TTL_30_MIN, now: NOW });
    const a2 = await railA.mint({ decision: d2, ttlMs: TTL_30_MIN, now: NOW });
    const b2 = await railB.mint({ decision: d2, ttlMs: TTL_30_MIN, now: NOW });
    expect(a2).toEqual(b2);
  });
});

describe("mint: request validation fails closed", () => {
  it("rejects a malformed merchant lock or purpose (RailSimError INVALID_REQUEST)", async () => {
    const rail = makeRail();
    const base = { decision: approvedDecision(), ttlMs: TTL_30_MIN, now: NOW };
    await expect(rail.mint({ ...base, merchantLock: "https://demo-apparel.example/path" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(rail.mint({ ...base, purpose: "crt_1234567890123" })).rejects.toBeInstanceOf(RailSimError); // 13 digits (I8)
    await expect(rail.mint({ ...base, purpose: "x".repeat(81) })).rejects.toBeInstanceOf(RailSimError);
    await expect(rail.mint({ ...base, now: new Date(Number.NaN) })).rejects.toBeInstanceOf(RailSimError);
    expect(rail.cards).toHaveLength(0);
  });

  it("rejects invalid configuration up front", () => {
    for (const options of [{ ceilingMinor: 0 }, { maxActive: 0 }, { maxTtlMs: -1 }, { validityMonths: 0 }, { ceilingMinor: 1.5 }]) {
      expect(() => new RailSim(options)).toThrow(RailSimError);
    }
  });
});

describe("T-I1: mint only after an APPROVE for that cart (property)", () => {
  const outcomeArb = fc.constantFrom("APPROVE", "DENY", "ESCALATE");
  it("a card exists exactly for the APPROVE decisions, with that decision's id and total", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ outcome: outcomeArb, total: fc.integer({ min: 1, max: 5_000 }) }), { minLength: 1, maxLength: 6 }),
        async (specs) => {
          const rail = makeRail({ maxActive: 100 }, 3);
          const approvedIds = new Map<string, number>();
          for (const [i, s] of specs.entries()) {
            const spec = { id: decisionId(i), totalMinor: s.total, remainingMinor: 10_000 };
            const decision = s.outcome === "APPROVE" ? approvedDecision(spec) : s.outcome === "DENY" ? deniedDecision(spec) : escalatedDecision(spec);
            const code = await mintCode(rail.mint({ decision, ttlMs: TTL_30_MIN, now: NOW }));
            expect(code).toBe(s.outcome === "APPROVE" ? "OK" : "NOT_APPROVED");
            if (s.outcome === "APPROVE") approvedIds.set(decision.id, s.total);
          }
          expect(rail.cards.map((c) => c.decision_id).sort()).toEqual([...approvedIds.keys()].sort());
          for (const card of rail.cards) expect(card.limit_minor).toBe(approvedIds.get(card.decision_id));
        },
      ),
      { numRuns: 60 },
    );
  });

  it("outcome tampering after the fact cannot mint: a DENY relabelled APPROVE has no limit", async () => {
    const denied = deniedDecision();
    const forged = { ...denied, outcome: "APPROVE" } as never;
    expect(await mintCode(makeRail().mint({ decision: forged, ttlMs: TTL_30_MIN, now: NOW }))).toBe("NOT_APPROVED");
  });
});

describe("T-I2: minted limit equals the approved total and is <= min(remaining, ceiling) (property)", () => {
  it("mints iff total <= min(remaining, ceiling); the limit is the total", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 400_000 }),
        fc.integer({ min: 1, max: 400_000 }),
        async (total, remaining) => {
          const rail = makeRail({}, 5);
          const decision = approvedDecision({ totalMinor: total, remainingMinor: remaining });
          const code = await mintCode(rail.mint({ decision, ttlMs: TTL_30_MIN, now: NOW }));
          const ceiling = RAIL_SIM_DEFAULTS.ceilingMinor;
          if (total > remaining) expect(code).toBe("NOT_APPROVED");
          else if (total > ceiling) expect(code).toBe("OVER_CEILING");
          else {
            expect(code).toBe("OK");
            const [card] = rail.cards;
            expect(card?.limit_minor).toBe(total);
            expect(card?.limit_minor).toBeLessThanOrEqual(Math.min(remaining, ceiling));
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("determinism", () => {
  it("the same seed gives the same ids, handles and last4", async () => {
    const a = await mintCard({ random: seededRandom(42) });
    const b = await mintCard({ random: seededRandom(42) });
    const c = await mintCard({ random: seededRandom(43) });
    expect(a.card).toEqual(b.card);
    expect(a.card.handle).not.toBe(c.card.handle);
  });
});
