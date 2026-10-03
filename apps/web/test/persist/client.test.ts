// The on-device client with its session kept: the real stack (engine, orchestrator, signed log, SIMULATED rail) in this
// test, a storage double for the browser, and a "reload" that is a new client opened on the same storage. The state after
// the reload has to equal the state before it, and carry on: same keys, same chain, same cards on the same rail.
import { verifyChain } from "@wally/core/verify";
import type { LogEntry } from "@wally/core/generated";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_KEY } from "../../src/api/local/persist/record";
import type { BoothSnapshot } from "../../src/api/types";
import { MemoryStorage } from "./memoryStorage";
import { rig, type Rig } from "./rig";
import { sealRequest } from "./support";

let current: Rig | null = null;
const start = (storage = new MemoryStorage()): Rig => (current = rig(storage));

afterEach(() => {
  current?.dispose();
  current = null;
  vi.unstubAllGlobals();
});

/** What a reload must not change: everything the screens read. */
function shown(snap: BoothSnapshot): unknown {
  return { mandate: snap.mandate, intentText: snap.intentText, packet: snap.packet, cards: snap.cards, escalations: snap.escalations, entries: snap.log.entries, head: snap.log.head };
}

const cardEventsOf = (entries: readonly LogEntry[]): string[] => entries.flatMap((e) => (e.kind === "CARD_EVENT" ? [e.payload.event === "DECLINED" ? `DECLINED:${e.payload.decline_code ?? ""}` : e.payload.event] : []));

describe("a page with nothing stored", () => {
  it("starts as it always did: no budget sealed, nothing to say, and it will keep what is sealed from now on", async () => {
    const { boot, storage } = start();
    const client = await boot();
    expect(client.outcome).toBe("fresh");
    expect(client.sessionEnded).toBe(false);
    expect((await client.snapshot()).mandate).toBeNull();
    expect((await client.info()).remembers).toBe(true);
    expect(storage.items.has(SESSION_KEY)).toBe(false);
  });

  it("writes the session after a seal, and again after each change", async () => {
    const { boot, storage, clock } = start();
    const client = await boot();
    await client.seal(sealRequest(clock, 300));
    client.flush();
    const first = storage.items.get(SESSION_KEY);
    expect(first).toBeDefined();
    await client.runScenario("small");
    client.flush();
    expect(storage.items.get(SESSION_KEY)).not.toBe(first);
  });

  it("keeps no secret outside the record, and nothing but the throwaway keys, the log and the head inside it", async () => {
    const { boot, storage, clock } = start();
    const client = await boot();
    await client.seal(sealRequest(clock, 300));
    await client.runScenario("small");
    client.flush();
    const record = JSON.parse(storage.items.get(SESSION_KEY) ?? "{}") as Record<string, unknown>;
    expect(Object.keys(record).sort()).toEqual(["head", "keys", "log", "savedAt", "v"]);
    expect([...storage.items.keys()]).toEqual([SESSION_KEY]);
    expect(JSON.stringify(await client.exportLog())).not.toContain((record["keys"] as { engine: { secret_key: string } }).engine.secret_key);
  });
});

describe("what the page says about its keys", () => {
  it("says they are kept, in info() and in the note beside the exported public keys, while the session is kept", async () => {
    const { boot, clock } = start();
    const client = await boot();
    await client.seal(sealRequest(clock, 300));
    expect(((await client.info()) as { keys?: string }).keys).toMatch(/kept in this browser until the demo is started over/);
    expect((await client.exportLog()).publicKeys.note).toMatch(/kept on this device until the demo is started over/);
  });

  it("keeps the old wording (new every time the page loads) when nothing is kept", async () => {
    const storage = new MemoryStorage();
    storage.fail = { set: true };
    const { boot, clock } = start(storage);
    const client = await boot();
    await client.seal(sealRequest(clock, 300));
    expect(((await client.info()) as { keys?: string }).keys).toMatch(/new every time the page loads/);
    expect((await client.exportLog()).publicKeys.note).toMatch(/made in this page when it loaded/);
  });
});

describe("a reload after a purchase (the bug this fixes)", () => {
  it("brings back the same budget, card, receipts and head: HK$300 sealed, socks bought, reload, nothing lost", async () => {
    const { boot, clock } = start();
    const before = await boot();
    await before.seal(sealRequest(clock, 300));
    const run = await before.runScenario("small");
    expect(run.outcome).toBe("APPROVE");
    const was = await before.snapshot();
    expect(was.packet?.remaining_minor).toBe(18_000);
    before.flush();

    const after = await boot();
    expect(after.outcome).toBe("restored");
    expect(after.sessionEnded).toBe(false);
    const now = await after.snapshot();
    expect(shown(now)).toEqual(shown(was));
    expect(now.cards.map((c) => [c.limit_minor, c.state])).toEqual([[12_000, "USED"]]);
    expect(now.log.entries.filter((e) => e.kind === "MANDATE_SEALED")).toHaveLength(1); // no new "Budget sealed" receipt
    expect((await after.getLog()).tampered).toBeNull();
  });

  it("goes on from there: another purchase, one chain, one engine key, and the offline verifier's check passes", async () => {
    const { boot, clock } = start();
    const before = await boot();
    await before.seal(sealRequest(clock, 800));
    await before.runScenario("normal");
    before.flush();

    const after = await boot();
    expect((await after.runScenario("small")).outcome).toBe("APPROVE");
    const exported = await after.exportLog();
    const entries = exported.log.split("\n").filter((l) => l !== "").map((l) => JSON.parse(l) as LogEntry);
    expect(entries.map((e) => e.seq)).toEqual(entries.map((_e, i) => i));
    expect(new Set(entries.map((e) => e.signer)).size).toBe(1);
    const verdict = verifyChain(entries, { engine: [...exported.publicKeys.engine], delegator: exported.publicKeys.delegator }, exported.checkpoint ?? undefined);
    expect(verdict.ok).toBe(true);
    expect((await after.verify()).result.ok).toBe(true);
    expect((await after.snapshot()).packet?.remaining_minor).toBe(80_000 - 25_900 - 12_000);
  });

  it("exports the agent that is in the sealed credential, the same before and after the reload", async () => {
    const { boot, clock } = start();
    const before = await boot();
    await before.seal(sealRequest(clock, 300));
    const agentBefore = (await before.exportLog()).publicKeys.agent;
    before.flush();
    const after = await boot();
    const exported = await after.exportLog();
    const sealed = JSON.parse(exported.log.split("\n")[0] ?? "{}") as { payload: { credentialSubject: { id: string } } };
    expect(exported.publicKeys.agent).toBe(sealed.payload.credentialSubject.id);
    expect(exported.publicKeys.agent).toBe(agentBefore);
    expect(exported.publicKeys.delegator).toBe((await before.exportLog()).publicKeys.delegator);
  });

  it("carries on the budget for Cancel: a cancelled budget stays cancelled after a reload", async () => {
    const { boot, clock } = start();
    const before = await boot();
    await before.seal(sealRequest(clock, 800));
    await before.runScenario("mint");
    await before.revoke({});
    before.flush();
    const after = await boot();
    const snap = await after.snapshot();
    expect(snap.packet?.status).toBe("REVOKED");
    expect(snap.cards.map((c) => c.state)).toEqual(["VOIDED"]);
    expect((await after.verify()).result.ok).toBe(true);
  });
});

describe("the SIMULATED rail after a reload", () => {
  it("an active card can still be charged (the rail knows it again), and then declines as used", async () => {
    const { boot, clock } = start();
    const before = await boot();
    await before.seal(sealRequest(clock, 800));
    await before.runScenario("mint");
    expect((await before.snapshot()).cards.map((c) => c.state)).toEqual(["ACTIVE"]);
    before.flush();

    const after = await boot();
    const pay = await after.runScenario("pay");
    expect(pay.outcome).toBe("APPROVE");
    const paid = await after.snapshot();
    expect(paid.cards.map((c) => c.state)).toEqual(["USED"]);
    expect(cardEventsOf(paid.log.entries)).toEqual(["AUTHORISED"]);
    const replay = await after.runScenario("replay");
    expect(cardEventsOf((await after.snapshot()).log.entries).slice(-1)).toEqual(["DECLINED:CARD_USED"]); // a used card, not an unknown handle
    expect(replay.scenario).toBe("replay");
  });

  it("a used card declines as used when it is tried again after a reload", async () => {
    const { boot, clock } = start();
    const before = await boot();
    await before.seal(sealRequest(clock, 800));
    await before.runScenario("normal");
    before.flush();
    const after = await boot();
    await after.runScenario("replay");
    expect(cardEventsOf((await after.snapshot()).log.entries).slice(-1)).toEqual(["DECLINED:CARD_USED"]);
  });

  it("cancelling after a reload voids the card that was active before it", async () => {
    const { boot, clock } = start();
    const before = await boot();
    await before.seal(sealRequest(clock, 800));
    await before.runScenario("mint");
    before.flush();
    const after = await boot();
    const result = await after.revoke({});
    expect(result.voidedCardIds).toHaveLength(1);
    expect((await after.snapshot()).cards.map((c) => c.state)).toEqual(["VOIDED"]);
  });

  it("a card that ran out while the page was closed expires on the first tick", async () => {
    const { boot, clock } = start();
    const before = await boot();
    await before.seal(sealRequest(clock, 800));
    await before.runScenario("mint");
    before.flush();
    clock.advance(31 * 60_000);
    const after = await boot();
    expect((await after.snapshot()).cards.map((c) => c.state)).toEqual(["EXPIRED"]);
  });

  it("a needs-your-OK question is still open after a reload and can be answered with the same delegator key", async () => {
    const { boot, clock } = start();
    const before = await boot();
    await before.seal(sealRequest(clock, 800));
    const run = await before.runScenario("unverified");
    expect(run.outcome).toBe("ESCALATE");
    before.flush();
    const after = await boot();
    const snap = await after.snapshot();
    expect(snap.escalations.map((e) => e.state)).toEqual(["OPEN"]);
    const answered = await after.answerEscalation({ decisionId: run.decisionId ?? "", choice: "APPROVE" });
    expect(answered.outcome).toBe("APPROVE");
    expect((await after.snapshot()).cards).toHaveLength(1);
    expect((await after.verify()).result.ok).toBe(true);
  });
});
