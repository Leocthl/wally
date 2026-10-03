// T-R1 (F1 parity for mint), T-I1 and T-I2 on the SIMULATED rail.
import { MintError } from "@wally/core/ports";
import { validateCardRecord } from "@wally/core/schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RAIL_SIM_DEFAULTS, RailSim, RailSimError, seededRandom } from "../src";
import {
  MERCHANT,
  MINUTE_MS,
  NOW,
  CARD_TTL_MS,
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

describe("rail defaults come from config (F1, F30), not from test literals", () => {
  it("are positive integers, frozen, and the card TTL fits inside the validity limit", () => {
    const { ceilingMinor, maxActive, maxTtlMs, validityMonths } = RAIL_SIM_DEFAULTS;
    for (const value of [ceilingMinor, maxActive, maxTtlMs, validityMonths]) expect(Number.isSafeInteger(value) && value > 0).toBe(true);
    expect(Object.isFrozen(RAIL_SIM_DEFAULTS)).toBe(true);
    expect(maxTtlMs).toBeLessThanOrEqual(validityMonths * 28 * DAY_MS);
    expect(new RailSim().limits).toEqual(RAIL_SIM_DEFAULTS);
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
      expires_at: new Date(NOW.getTime() + CARD_TTL_MS).toISOString(),
    });
    expect(card.handle).toMatch(/^hdl_[A-Za-z0-9_-]{16,64}$/);
    expect(card.last4).toMatch(/^[0-9]{4}$/);
  });

  // Changed (lane s-fix-core, audit S-RAIL-4): the lock is never absent; it defaults to the approved cart's domain.
  it("locks to the approved merchant when no lock is asked for, and omits purpose when not requested", async () => {
    const { card, decision } = await mintCard();
    expect(card.merchant_lock).toBe(decision.cart.merchant.domain);
    expect(card).not.toHaveProperty("purpose");
  });

  it("refuses a lock for any merchant but the approved one (NOT_APPROVED), and a malformed lock (INVALID_REQUEST)", async () => {
    const rail = makeRail();
    const base = { decision: approvedDecision(), ttlMs: CARD_TTL_MS, now: NOW };
    expect(await mintCode(rail.mint({ ...base, merchantLock: "evil-shop.example" }))).toBe("NOT_APPROVED");
    await expect(rail.mint({ ...base, merchantLock: "Evil.example/x" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(rail.cards).toHaveLength(0);
  });

  it("refuses an APPROVE that still carries a failing rule (a relabelled DENY or ESCALATE)", async () => {
    const rail = makeRail();
    const ok = approvedDecision();
    const failing = { ...ok, rules: [...ok.rules, { id: "R6", result: "FAIL", verdict: "DENY", inputs: {}, comparator: "in", template_id: "R6.off_mandate" }] };
    expect(await mintCode(rail.mint({ decision: failing as never, ttlMs: CARD_TTL_MS, now: NOW }))).toBe("NOT_APPROVED");
    expect(rail.cards).toHaveLength(0);
  });

  it("never mints for DENY, ESCALATE or a missing limit (NOT_APPROVED)", async () => {
    const rail = makeRail();
    const req = { ttlMs: CARD_TTL_MS, now: NOW };
    expect(await mintCode(rail.mint({ ...req, decision: deniedDecision() }))).toBe("NOT_APPROVED");
    expect(await mintCode(rail.mint({ ...req, decision: escalatedDecision() }))).toBe("NOT_APPROVED");
    const { approved_limit_minor: _limit, ...noLimit } = approvedDecision();
    expect(await mintCode(rail.mint({ ...req, decision: noLimit as never }))).toBe("NOT_APPROVED");
    expect(rail.cards).toHaveLength(0);
  });

  it("fails closed on malformed or inconsistent decisions (NOT_APPROVED)", async () => {
    const rail = makeRail();
    const req = { ttlMs: CARD_TTL_MS, now: NOW };
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
      { ...ok, cart: { ...ok.cart, mandate_id: "mnd_otherMandate1" } }, // the cart belongs to another mandate
      { ...ok, packet: { ...ok.packet, mandate_id: "mnd_otherMandate1" } }, // the packet belongs to another mandate
    ];
    for (const decision of cases) {
      expect(await mintCode(rail.mint({ ...req, decision: decision as never }))).toBe("NOT_APPROVED");
    }
    expect(rail.cards).toHaveLength(0);
  });

  it("OVER_CEILING above the ceiling [F1], allowed exactly at it", async () => {
    const ceilingMinor = 150_000;
    const rail = makeRail({ ceilingMinor });
    const at = approvedDecision({ id: decisionId(1), totalMinor: ceilingMinor, remainingMinor: 2 * ceilingMinor });
    const over = approvedDecision({ id: decisionId(2), totalMinor: ceilingMinor + 1, remainingMinor: 2 * ceilingMinor });
    expect((await rail.mint({ decision: at, ttlMs: CARD_TTL_MS, now: NOW })).limit_minor).toBe(ceilingMinor);
    expect(await mintCode(rail.mint({ decision: over, ttlMs: CARD_TTL_MS, now: NOW }))).toBe("OVER_CEILING");
    expect(rail.cards).toHaveLength(1);
  });

  it("the ceiling is checked before the engine-bug backstops, so OVER_CEILING names the rail rule", async () => {
    const rail = makeRail({ ceilingMinor: 50_000 });
    const decision = approvedDecision({ totalMinor: 60_000, remainingMinor: 1_000 });
    expect(await mintCode(rail.mint({ decision, ttlMs: CARD_TTL_MS, now: NOW }))).toBe("OVER_CEILING");
    const tampered = { ...approvedDecision({ totalMinor: 10_000 }), approved_limit_minor: 50_001 };
    expect(await mintCode(rail.mint({ decision: tampered, ttlMs: CARD_TTL_MS, now: NOW }))).toBe("OVER_CEILING");
    const within = { ...approvedDecision({ totalMinor: 10_000 }), approved_limit_minor: 20_000 };
    expect(await mintCode(rail.mint({ decision: within, ttlMs: CARD_TTL_MS, now: NOW }))).toBe("NOT_APPROVED");
  });

  it("MAX_ACTIVE at the active-card maximum [F1]; a used, voided or expired card frees a slot", async () => {
    const rail = makeRail({ maxActive: 2 });
    const mint = (n: number) => rail.mint({ decision: approvedDecision({ id: decisionId(n), totalMinor: 1_000 * n }), ttlMs: CARD_TTL_MS, now: NOW });
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
    const rail = makeRail({ maxActive: 2 });
    const decisions = [1, 2].map((n) => approvedDecision({ id: decisionId(n), totalMinor: 1_000 }));
    const cards = [];
    for (const decision of decisions) cards.push(await rail.mint({ decision, ttlMs: CARD_TTL_MS, now: NOW }));
    expect(await rail.mint({ decision: decisions[0]!, ttlMs: CARD_TTL_MS, now: NOW })).toEqual(cards[0]);
    expect(rail.cards).toHaveLength(2);
  });
});

describe("mint: TTL = min(card TTL [F30], packet expiry, validity [F1])", () => {
  it("rejects a TTL above the card TTL [F30] (TTL_TOO_LONG)", async () => {
    const rail = makeRail();
    const decision = approvedDecision();
    expect(await mintCode(rail.mint({ decision, ttlMs: CARD_TTL_MS + 1, now: NOW }))).toBe("TTL_TOO_LONG");
    expect(rail.cards).toHaveLength(0);
    expect((await rail.mint({ decision, ttlMs: CARD_TTL_MS, now: NOW })).state).toBe("ACTIVE");
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

  it("caps validity at the validity limit in calendar months [F1] when the card TTL is configured higher", async () => {
    const rail = makeRail({ maxTtlMs: 90 * DAY_MS, validityMonths: 2 });
    const packetExpiresAt = "2027-01-31T00:00:00Z";
    const decision = approvedDecision({ packetExpiresAt });
    const twoMonths = Date.parse("2026-12-03T02:05:02Z") - NOW.getTime();
    expect(await mintCode(rail.mint({ decision, ttlMs: twoMonths + 1, now: NOW }))).toBe("TTL_TOO_LONG");
    const card = await rail.mint({ decision, ttlMs: twoMonths, now: NOW });
    expect(card.expires_at).toBe("2026-12-03T02:05:02.000Z");
  });

  it("clamps month-end validity (31 Dec plus the validity limit lands on the last day of February)", async () => {
    const rail = makeRail({ maxTtlMs: 90 * DAY_MS, validityMonths: 2 });
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
    const req = { decision, ttlMs: CARD_TTL_MS, now: NOW, merchantLock: MERCHANT, purpose: "crt_test000001" };
    const first = await rail.mint(req);
    const again = await rail.mint({ ...req, now: new Date(NOW.getTime() + 1_000) });
    expect(again).toEqual(first);
    expect(rail.cards).toHaveLength(1);
  });

  // Changed (lane s-fix-core, audit LOW): a repeat returns the card as it is now; "ACTIVE" for a spent card let a caller
  // log a USED card as live.
  it("a repeat after the card was used returns its current state (USED) and mints nothing", async () => {
    const rail = makeRail();
    const decision = approvedDecision({ totalMinor: 1_000 });
    const first = await rail.mint({ decision, ttlMs: CARD_TTL_MS, now: NOW });
    await rail.authorise({ handle: first.handle, amountMinor: 1_000, merchantDomain: MERCHANT, now: NOW, idempotencyKey: "used_once" });
    expect(await rail.mint({ decision, ttlMs: CARD_TTL_MS, now: NOW })).toEqual({ ...first, state: "USED" });
    expect(rail.cards).toHaveLength(1);
  });

  it("a repeat whose limit is not the cart total is NOT_APPROVED (I2 holds for repeats too)", async () => {
    const rail = makeRail();
    const decision = approvedDecision({ totalMinor: 1_000 });
    await rail.mint({ decision, ttlMs: CARD_TTL_MS, now: NOW });
    const tampered = { ...decision, cart: { ...decision.cart, total_minor: 999, subtotal_minor: 999, items: [{ ...decision.cart.items[0], unit_price_minor: 999 }] } };
    expect(await mintCode(rail.mint({ decision: tampered as never, ttlMs: CARD_TTL_MS, now: NOW }))).toBe("NOT_APPROVED");
  });

  it("ALREADY_MINTED only when the repeat asks for different terms", async () => {
    const rail = makeRail();
    const decision = approvedDecision();
    const base = { decision, ttlMs: CARD_TTL_MS, now: NOW, merchantLock: MERCHANT, purpose: "crt_test000001" };
    await rail.mint(base);
    expect(await mintCode(rail.mint({ ...base, merchantLock: "other-shop.example" }))).toBe("ALREADY_MINTED");
    expect(await mintCode(rail.mint({ ...base, purpose: "crt_test000002" }))).toBe("ALREADY_MINTED");
    const { merchantLock: _lock, ...noLock } = base;
    expect(await mintCode(rail.mint(noLock))).toBe("OK"); // no lock = the approved merchant's lock: the same terms (S-RAIL-4)
    const bigger = approvedDecision({ totalMinor: 30_000 });
    expect(await mintCode(rail.mint({ ...base, decision: { ...bigger, id: decision.id } }))).toBe("ALREADY_MINTED");
    expect(rail.cards).toHaveLength(1);
  });

  it("two concurrent mints for one decision produce one card", async () => {
    const rail = makeRail();
    const req = { decision: approvedDecision(), ttlMs: CARD_TTL_MS, now: NOW };
    const [a, b] = await Promise.all([rail.mint(req), rail.mint(req)]);
    expect(a).toEqual(b);
    expect(rail.cards).toHaveLength(1);
  });

  it("a repeat does not consume the random source", async () => {
    const railA = makeRail({}, 99);
    const railB = makeRail({}, 99);
    const d1 = approvedDecision({ id: decisionId(1), totalMinor: 1_000 });
    const d2 = approvedDecision({ id: decisionId(2), totalMinor: 2_000 });
    await railA.mint({ decision: d1, ttlMs: CARD_TTL_MS, now: NOW });
    await railA.mint({ decision: d1, ttlMs: CARD_TTL_MS, now: NOW });
    await railB.mint({ decision: d1, ttlMs: CARD_TTL_MS, now: NOW });
    const a2 = await railA.mint({ decision: d2, ttlMs: CARD_TTL_MS, now: NOW });
    const b2 = await railB.mint({ decision: d2, ttlMs: CARD_TTL_MS, now: NOW });
    expect(a2).toEqual(b2);
  });
});

describe("mint: request validation fails closed", () => {
  it("rejects a malformed merchant lock or purpose (RailSimError INVALID_REQUEST)", async () => {
    const rail = makeRail();
    const base = { decision: approvedDecision(), ttlMs: CARD_TTL_MS, now: NOW };
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
            const code = await mintCode(rail.mint({ decision, ttlMs: CARD_TTL_MS, now: NOW }));
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
    expect(await mintCode(makeRail().mint({ decision: forged, ttlMs: CARD_TTL_MS, now: NOW }))).toBe("NOT_APPROVED");
  });
});

describe("T-I2: minted limit equals the approved total and is <= min(remaining, ceiling) (property)", () => {
  it("mints iff total <= min(remaining, ceiling); the limit is the total", async () => {
    const ceiling = RAIL_SIM_DEFAULTS.ceilingMinor;
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 2 * ceiling }),
        fc.integer({ min: 1, max: 2 * ceiling }),
        async (total, remaining) => {
          const rail = makeRail({}, 5);
          const decision = approvedDecision({ totalMinor: total, remainingMinor: remaining });
          const code = await mintCode(rail.mint({ decision, ttlMs: CARD_TTL_MS, now: NOW }));
          if (total > ceiling) expect(code).toBe("OVER_CEILING");
          else if (total > remaining) expect(code).toBe("NOT_APPROVED");
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
