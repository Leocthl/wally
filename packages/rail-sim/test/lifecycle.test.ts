// T-R1 (F1 parity for void and expiry): void acts on ACTIVE cards only [F2]; expireDue(now).
import { validateCardEvent } from "@laisee/core/schema";
import { describe, expect, it } from "vitest";
import type { RailSim } from "../src";
import { MINUTE_MS, NOW, CARD_TTL_MS, approvedDecision, decisionId, makeRail, mintCard, pay } from "./helpers";

async function mintMany(rail: RailSim, totals: readonly number[], ttlMs = CARD_TTL_MS) {
  const cards = [];
  for (const [i, totalMinor] of totals.entries()) {
    cards.push(await rail.mint({ decision: approvedDecision({ id: decisionId(i + 1), totalMinor }), ttlMs, now: NOW }));
  }
  return cards;
}

describe("void: ACTIVE cards only; a used card is final [F2]", () => {
  it("voids an ACTIVE card and emits a schema-valid SIMULATED VOIDED event", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: 5_000 });
    const later = new Date(NOW.getTime() + MINUTE_MS);
    const event = await rail.void(card.id, later);
    expect(event).toEqual({ card_id: card.id, event: "VOIDED", at: later.toISOString(), simulated: true });
    expect(validateCardEvent(event).ok).toBe(true);
    expect(rail.card(card.id)?.state).toBe("VOIDED");
    expect(rail.ledger(card.id)).toMatchObject({ held_minor: 0, settled_minor: 0, released_minor: 5_000 });
  });

  it("refuses to void a USED card (processed payments cannot be cancelled [F2])", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: 5_000 });
    await pay(rail, card, 5_000);
    await expect(rail.void(card.id, NOW)).rejects.toMatchObject({ code: "NOT_ACTIVE", message: expect.stringContaining("F2") });
    expect(rail.card(card.id)?.state).toBe("USED");
  });

  it("refuses to void twice, an EXPIRED card, or an unknown card", async () => {
    const rail = makeRail();
    const [a, b] = await mintMany(rail, [1_000, 2_000]);
    await rail.void(a!.id, NOW);
    await expect(rail.void(a!.id, NOW)).rejects.toMatchObject({ code: "NOT_ACTIVE" });
    await rail.expireDue(new Date(NOW.getTime() + CARD_TTL_MS));
    await expect(rail.void(b!.id, NOW)).rejects.toMatchObject({ code: "NOT_ACTIVE" });
    await expect(rail.void("crd_doesNotExist1", NOW)).rejects.toMatchObject({ code: "UNKNOWN_CARD" });
  });

  it("a voided card cannot be charged", async () => {
    const rail = makeRail();
    const [a] = await mintMany(rail, [1_000, 2_000]);
    await rail.void(a!.id, NOW);
    expect(await pay(rail, a!, 1_000)).toMatchObject({ decline_code: "CARD_VOIDED" });
    expect(rail.authorisations()).toHaveLength(0);
  });
});

describe("expireDue(now)", () => {
  it("expires only ACTIVE cards whose expiry has passed, in mint order, once", async () => {
    const rail = makeRail();
    const cards = await mintMany(rail, [1_000, 2_000]);
    const [first, second] = cards;
    await pay(rail, second!, 2_000); // USED cards are never expired
    expect(await rail.expireDue(new Date(NOW.getTime() + CARD_TTL_MS - 1))).toEqual([]);
    const at = new Date(NOW.getTime() + CARD_TTL_MS);
    const events = await rail.expireDue(at);
    expect(events).toEqual([{ card_id: first!.id, event: "EXPIRED", at: at.toISOString(), simulated: true }]);
    expect(events.every((e) => validateCardEvent(e).ok)).toBe(true);
    expect(rail.card(first!.id)?.state).toBe("EXPIRED");
    expect(rail.card(second!.id)?.state).toBe("USED");
    expect(await rail.expireDue(at)).toEqual([]);
    expect(rail.ledger(first!.id)).toMatchObject({ released_minor: 1_000, held_minor: 0 });
  });

  it("expires several due cards at once, oldest mint first", async () => {
    const rail = makeRail();
    const cards = await mintMany(rail, [1_000, 2_000]);
    const events = await rail.expireDue(new Date(NOW.getTime() + 2 * CARD_TTL_MS));
    expect(events.map((e) => e.card_id)).toEqual(cards.map((c) => c.id));
  });

  it("an expired card is final: no charge, no void", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: 1_000 });
    await rail.expireDue(new Date(NOW.getTime() + CARD_TTL_MS));
    expect(await pay(rail, card, 1_000)).toMatchObject({ decline_code: "CARD_EXPIRED" });
    await expect(rail.void(card.id, NOW)).rejects.toMatchObject({ code: "NOT_ACTIVE" });
  });
});

describe("inspection API returns frozen copies (immutability)", () => {
  it("cards and ledgers cannot be edited by callers", async () => {
    const { rail, card } = await mintCard({}, { totalMinor: 1_000 });
    expect(Object.isFrozen(card)).toBe(true);
    expect(Object.isFrozen(rail.cards)).toBe(true);
    expect(() => {
      (card as { limit_minor: number }).limit_minor = 9_999_999;
    }).toThrow(TypeError);
    expect(rail.card(card.id)?.limit_minor).toBe(1_000);
    expect(rail.card("crd_nothingHere")).toBeUndefined();
    expect(rail.ledger("crd_nothingHere")).toBeUndefined();
  });
});
