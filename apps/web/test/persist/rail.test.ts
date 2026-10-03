// The SIMULATED rail lives in the page, so a reload would forget its cards: a card the log calls ACTIVE could no longer be
// charged, a used card would not decline as used, and the limit on active cards would count none. The rail is therefore
// rebuilt from the log, through the rail's own public calls (mint, authorise, void, expireDue) with the stored ids and last4
// played back, and checked against the log card by card. It either matches exactly or the restore is refused.
import { createIdSource, RailSim, seededRandom, type RandomSource } from "@wally/rail-sim";
import type { CardRecord, LogEntry } from "@wally/core/generated";
import { FakeRail } from "@wally/core/testing";
import { describe, expect, it } from "vitest";
import { PlaybackRandom, RailReplayError, replayRail } from "../../src/api/local/persist/rail";
import { sampleLog, sealRequest } from "./support";

const HONEST = (card: CardRecord, amountMinor = card.limit_minor, key = "chk:test:1") => ({
  handle: card.handle,
  amountMinor,
  merchantDomain: card.merchant_lock ?? "demo-apparel.example",
  now: new Date("2026-10-03T02:10:00.000Z"),
  idempotencyKey: key,
});

const cardsOf = (entries: readonly LogEntry[]): CardRecord[] => entries.flatMap((e) => (e.kind === "CARD_MINTED" ? [e.payload] : []));

async function rebuilt(entries: readonly LogEntry[]): Promise<{ rail: RailSim; playback: PlaybackRandom }> {
  const playback = new PlaybackRandom(seededRandom(99));
  const rail = new RailSim({ random: playback });
  await replayRail(rail, playback, entries);
  return { rail, playback };
}

describe("PlaybackRandom", () => {
  it("makes the stored card id, handle and last4 from the rail's own id source, for many cards", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const original = createIdSource(seededRandom(seed));
      const last4 = String(seededRandom(seed + 1000).nextInt(10_000)).padStart(4, "0");
      const card = { id: original.cardId(), handle: original.handle(), last4 } as CardRecord;
      const playback = new PlaybackRandom(seededRandom(7));
      playback.queue(card);
      const again = createIdSource(playback);
      expect(again.cardId(), `seed ${seed}`).toBe(card.id);
      expect(again.handle(), `seed ${seed}`).toBe(card.handle);
      expect(String(playback.nextInt(10_000)).padStart(4, "0")).toBe(last4);
      expect(playback.queued).toBe(0);
    }
  });

  it("plays back ids that had a run of digits (the rail then draws from letters only)", () => {
    // Digits first (draws 52..61 of the 62), so the id starts with a long digit run and the next draws are letters.
    const digits: RandomSource = { nextInt: (max) => (max === 62 ? 53 : 3) };
    const original = createIdSource(digits);
    const card = { id: original.cardId(), handle: original.handle(), last4: "0007" } as CardRecord;
    expect(card.id).toMatch(/^crd_[1-9]{4}[A-Za-z]/);
    const playback = new PlaybackRandom(seededRandom(7));
    playback.queue(card);
    const again = createIdSource(playback);
    expect(again.cardId()).toBe(card.id);
    expect(again.handle()).toBe(card.handle);
  });

  it("falls back to the real source once the queue is empty, so new cards are new", () => {
    const base: RandomSource = { nextInt: (max) => max - 1 };
    const playback = new PlaybackRandom(base);
    expect(playback.nextInt(100)).toBe(99);
    expect(playback.queued).toBe(0);
  });

  it("refuses a character the rail's alphabet cannot make, and a last4 out of range", () => {
    const playback = new PlaybackRandom(seededRandom(7));
    playback.queue({ id: "crd_!!!!!!!!!!!!", handle: "hdl_abcdefghijklmnopqrstuvwx", last4: "0001" } as CardRecord);
    expect(() => playback.nextInt(62)).toThrow(RailReplayError);
  });
});

describe("replayRail", () => {
  it("rebuilds a used card: charged once for the exact amount, and a second try declines as used", async () => {
    const { entries } = await sampleLog();
    const [card] = cardsOf(entries);
    const { rail } = await rebuilt(entries);
    expect(rail.card(card?.id ?? "")?.state).toBe("USED");
    expect(rail.cards).toHaveLength(1);
    expect(rail.ledger(card?.id ?? "")).toMatchObject({ state: "USED", settled_minor: card?.limit_minor, held_minor: 0 });
    const again = await rail.authorise(HONEST(card as CardRecord));
    expect(again).toMatchObject({ event: "DECLINED", decline_code: "CARD_USED" });
  });

  it("rebuilds an active card that can still be charged with the stored handle", async () => {
    const { entries } = await sampleLog(async (client, clock) => {
      await client.seal(sealRequest(clock));
      await client.runScenario("mint");
    });
    const [card] = cardsOf(entries);
    const { rail } = await rebuilt(entries);
    expect(rail.card(card?.id ?? "")).toMatchObject({ state: "ACTIVE", handle: card?.handle, last4: card?.last4, expires_at: card?.expires_at });
    expect(rail.ledger(card?.id ?? "")).toMatchObject({ held_minor: card?.limit_minor });
    expect(await rail.authorise(HONEST(card as CardRecord))).toMatchObject({ event: "AUTHORISED" });
  });

  it("rebuilds a voided card and an expired card", async () => {
    const voided = await sampleLog(async (client, clock) => {
      await client.seal(sealRequest(clock));
      await client.runScenario("mint");
      await client.revoke({});
    });
    const expired = await sampleLog(async (client, clock) => {
      await client.seal(sealRequest(clock));
      await client.runScenario("mint");
      clock.advance(31 * 60_000);
      await client.snapshot(); // every request ticks first: the card expires
    });
    const a = await rebuilt(voided.entries);
    expect(a.rail.cards.map((c) => c.state)).toEqual(["VOIDED"]);
    expect(await a.rail.authorise(HONEST(cardsOf(voided.entries)[0] as CardRecord))).toMatchObject({ decline_code: "CARD_VOIDED" });
    const b = await rebuilt(expired.entries);
    expect(b.rail.cards.map((c) => c.state)).toEqual(["EXPIRED"]);
  });

  it("rebuilds an active card next to a used one, in the order they were minted", async () => {
    const { entries } = await sampleLog(async (client, clock) => {
      await client.seal(sealRequest(clock));
      await client.runScenario("small");
      await client.runScenario("mint");
    });
    const { rail } = await rebuilt(entries);
    expect(rail.cards.map((c) => c.state)).toEqual(["USED", "ACTIVE"]);
    expect(rail.cards.map((c) => c.id)).toEqual(cardsOf(entries).map((c) => c.id));
    expect(rail.limits.maxActive).toBe(2);
  });

  it("rebuilds a history with declines in it (an overshoot refused, the exact charge, a replay refused)", async () => {
    const { entries } = await sampleLog(async (client, clock) => {
      await client.seal(sealRequest(clock));
      await client.runScenario("overshoot");
      await client.runScenario("small");
    });
    expect(entries.filter((e) => e.kind === "CARD_EVENT" && e.payload.event === "DECLINED").length).toBeGreaterThanOrEqual(2);
    const { rail } = await rebuilt(entries);
    expect(rail.cards.map((c) => c.state)).toEqual(["USED", "USED"]);
    expect(rail.cards.map((c) => c.id)).toEqual(cardsOf(entries).map((c) => c.id));
  });

  it("leaves the random source ready for new cards: the next mint is a new card, not a repeat", async () => {
    const { entries } = await sampleLog();
    const { playback } = await rebuilt(entries);
    expect(playback.queued).toBe(0);
    const fresh = createIdSource(playback);
    expect(fresh.cardId()).not.toBe(cardsOf(entries)[0]?.id);
  });

  it("refuses a rail that is not the SIMULATED rail (it could not be checked)", async () => {
    const { entries } = await sampleLog();
    await expect(replayRail(new FakeRail(), new PlaybackRandom(seededRandom(1)), entries)).rejects.toBeInstanceOf(RailReplayError);
  });

  it("refuses a log whose card event names a card that was never minted", async () => {
    const { entries } = await sampleLog();
    const changed = entries.map((e) => (e.kind === "CARD_EVENT" && e.payload.event === "AUTHORISED" ? ({ ...e, payload: { ...e.payload, card_id: "crd_neverMinted01" } } as LogEntry) : e));
    await expect(rebuilt(changed)).rejects.toThrow(/not in the log/);
  });

  it("refuses a card whose decision is not in the log", async () => {
    const { entries } = await sampleLog();
    await expect(rebuilt(entries.filter((e) => e.kind !== "DECISION"))).rejects.toThrow(/decision/);
  });

  it("refuses a log the rail would not have produced (a charge above the limit)", async () => {
    const { entries } = await sampleLog();
    const changed = entries.map((e) => (e.kind === "CARD_EVENT" && e.payload.event === "AUTHORISED" ? ({ ...e, payload: { ...e.payload, amount_minor: (e.payload.amount_minor ?? 0) + 1 } } as LogEntry) : e));
    await expect(rebuilt(changed)).rejects.toBeInstanceOf(RailReplayError);
  });
});
