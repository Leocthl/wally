// Audit LOW and H5 on the SIMULATED rail (lane s-fix-core): expiry is judged on the rail's own monotonic time (an
// injected clock, and never earlier than any time the rail has seen), and the rail can hand back its own record of a
// charge by idempotency key without charging again.
import { FakeClock } from "@laisee/core/testing";
import { describe, expect, it } from "vitest";
import { RailSim, seededRandom } from "../src";
import { CARD_TTL_MS, MERCHANT, NOW, approvedDecision, mintCard, pay } from "./helpers";

const LIMIT = 25_900;

describe("expiry on the rail's monotonic time", () => {
  it("a stale request time cannot charge a card the rail has already seen expire", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    expect(await rail.expireDue(new Date(NOW.getTime() + CARD_TTL_MS - 1))).toEqual([]); // time moves on, nothing due yet
    const late = new Date(NOW.getTime() + CARD_TTL_MS);
    expect(await pay(rail, card, LIMIT, { now: late })).toMatchObject({ decline_code: "CARD_EXPIRED" });
    expect(await pay(rail, card, LIMIT, { now: NOW })).toMatchObject({ event: "DECLINED", decline_code: "CARD_EXPIRED" });
    expect(rail.authorisations()).toHaveLength(0);
  });

  it("an injected clock past the card's expiry wins over the caller's now", async () => {
    const clock = new FakeClock(NOW.toISOString());
    const rail = new RailSim({ random: seededRandom(7), clock });
    const card = await rail.mint({ decision: approvedDecision({ totalMinor: LIMIT }), ttlMs: CARD_TTL_MS, now: NOW });
    clock.advance(CARD_TTL_MS);
    expect(await pay(rail, card, LIMIT, { now: NOW })).toMatchObject({ decline_code: "CARD_EXPIRED" });
    expect((await rail.expireDue(NOW)).map((e) => e.card_id)).toEqual([card.id]);
  });

  it("a mint with a stale now cannot use a packet that expired on the rail's clock", async () => {
    const clock = new FakeClock(NOW.toISOString());
    const rail = new RailSim({ random: seededRandom(7), clock });
    const packetExpiresAt = new Date(NOW.getTime() + 60_000).toISOString();
    clock.advance(60_000);
    await expect(rail.mint({ decision: approvedDecision({ packetExpiresAt }), ttlMs: CARD_TTL_MS, now: NOW })).rejects.toMatchObject({ code: "TTL_TOO_LONG" });
    expect(rail.cards).toHaveLength(0);
  });

  it("a clock that returns an invalid Date fails closed", async () => {
    const rail = new RailSim({ random: seededRandom(7), clock: { now: () => new Date(Number.NaN) } });
    await expect(rail.mint({ decision: approvedDecision(), ttlMs: CARD_TTL_MS, now: NOW })).rejects.toMatchObject({ code: "INVALID_CONFIG" });
  });
});

describe("eventFor: the rail's own record by idempotency key (H5)", () => {
  it("returns the recorded charge or decline, null for an unused key, and never charges", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: LIMIT });
    expect(await rail.eventFor("k_unused")).toBeNull();
    const over = await pay(rail, card, LIMIT + 1, { key: "k_over" });
    const ok = await pay(rail, card, LIMIT, { key: "k_ok", domain: MERCHANT });
    expect(await rail.eventFor("k_over")).toEqual(over);
    expect(await rail.eventFor("k_ok")).toEqual(ok);
    expect(await rail.eventFor("k_ok")).toEqual(ok);
    expect(rail.authorisations()).toHaveLength(1);
  });
});
