// The on-device client with its session kept: the real stack (engine, orchestrator, signed log, SIMULATED rail) in this
// test, a storage double for the browser, and a "reload" that is a new client opened on the same storage. The state after
// the reload has to equal the state before it, and carry on: same keys, same chain, same cards on the same rail.
import { verifyChain } from "@wally/core/verify";
import type { LogEntry } from "@wally/core/generated";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newKeyMaterial } from "../../src/api/local/persist/keys";
import { SESSION_KEY } from "../../src/api/local/persist/record";
import type { BoothSnapshot, TraceEvent } from "../../src/api/types";
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

describe("a stored session that cannot be restored starts the page fresh and says so once", () => {
  async function stored(): Promise<{ storage: MemoryStorage; rig: Rig; text: string }> {
    const r = start();
    const client = await r.boot();
    await client.seal(sealRequest(r.clock, 300));
    await client.runScenario("small");
    client.flush();
    client.dispose();
    return { storage: r.storage, rig: r, text: r.storage.items.get(SESSION_KEY) ?? "" };
  }

  type Stored = { v: number; savedAt: string; keys: unknown; log: string; head: unknown };
  const damages: ReadonlyArray<readonly [string, (record: Stored, text: string) => string]> = [
    ["not JSON", (_record, text) => text.slice(0, 40)],
    ["another version", (record) => JSON.stringify({ ...record, v: 2 })],
    ["a log edited after signing", (record) => JSON.stringify({ ...record, log: record.log.replace(/"total_minor":(\d)/, (_m, d: string) => `"total_minor":${Number(d) === 9 ? 1 : Number(d) + 1}`) })],
    ["a log cut short", (record) => JSON.stringify({ ...record, log: `${record.log.split("\n").slice(0, -2).join("\n")}\n` })],
  ];

  it.each(damages)("%s", async (_name, damage) => {
    const { storage, rig: r, text } = await stored();
    const damaged = damage(JSON.parse(text) as Stored, text);
    expect(damaged).not.toBe(text);
    storage.items.set(SESSION_KEY, damaged);
    const client = await r.boot();
    expect(client.outcome).toBe("ended");
    expect(client.sessionEnded).toBe(true);
    const snap = await client.snapshot();
    expect(snap.mandate).toBeNull();
    expect(snap.log.entries).toEqual([]);
    expect(storage.items.has(SESSION_KEY)).toBe(false);
    await client.seal(sealRequest(r.clock, 500)); // and it works as a new page
    expect((await client.snapshot()).packet?.remaining_minor).toBe(50_000);
  });

  it("the budget has ended", async () => {
    const { rig: r } = await stored();
    r.clock.advance(40 * 86_400_000);
    const client = await r.boot();
    expect(client.outcome).toBe("ended");
    expect((await client.snapshot()).mandate).toBeNull();
    expect(r.storage.items.has(SESSION_KEY)).toBe(false);
  });

  it("keys that did not sign this log", async () => {
    const { storage, rig: r, text } = await stored();
    storage.items.set(SESSION_KEY, JSON.stringify({ ...(JSON.parse(text) as object), keys: newKeyMaterial().files }));
    const client = await r.boot();
    expect(client.outcome).toBe("ended");
    expect((await client.snapshot()).mandate).toBeNull();
    expect(storage.items.has(SESSION_KEY)).toBe(false);
  });

  it("is said once: the next boot, with the bad record gone, has nothing to say", async () => {
    const { storage, rig: r } = await stored();
    storage.items.set(SESSION_KEY, "{broken");
    const first = await r.boot();
    expect(first.sessionEnded).toBe(true);
    const second = await r.boot();
    expect(second.sessionEnded).toBe(false);
    expect(second.outcome).toBe("fresh");
  });
});

describe("a browser that will not keep it", () => {
  it.each([
    ["reads throw", { get: true }],
    ["writes throw", { set: true }],
    ["removals throw", { remove: true }],
  ] as const)("works as before when %s: no restore, no note, no crash", async (_name, fail) => {
    const storage = new MemoryStorage();
    storage.fail = fail;
    const { boot, clock } = start(storage);
    const client = await boot();
    expect(client.sessionEnded).toBe(false);
    expect((await client.info()).remembers).toBe(false);
    await client.seal(sealRequest(clock, 300));
    expect((await client.runScenario("small")).outcome).toBe("APPROVE");
    expect(() => client.flush()).not.toThrow();
    expect((await client.verify()).result.ok).toBe(true);
  });

  it("no storage object at all (null) is the same", async () => {
    const { boot, clock } = start();
    const client = await boot({ storage: null });
    expect((await client.info()).remembers).toBe(false);
    await client.seal(sealRequest(clock, 300));
    expect((await client.snapshot()).mandate).not.toBeNull();
  });

  it("a storage that fills up mid-session leaves no stale record: the next page starts fresh, never at an earlier state", async () => {
    const { boot, clock, storage } = start();
    const client = await boot();
    await client.seal(sealRequest(clock, 800));
    await client.runScenario("normal");
    client.flush();
    expect(storage.items.has(SESSION_KEY)).toBe(true);
    storage.fail = { set: true };
    await client.runScenario("small");
    client.flush();
    storage.fail = {};
    expect(storage.items.has(SESSION_KEY)).toBe(false);
    const reloaded = await boot();
    expect(reloaded.outcome).toBe("fresh");
    expect((await reloaded.snapshot()).mandate).toBeNull();
  });
});

describe("start over", () => {
  it("deletes the stored session, and the fresh budget it seals is not kept until something happens in it", async () => {
    const { boot, clock, storage } = start();
    const client = await boot();
    await client.seal(sealRequest(clock, 300));
    await client.runScenario("small");
    client.flush();
    expect(storage.items.has(SESSION_KEY)).toBe(true);

    await client.reset();
    expect(storage.items.has(SESSION_KEY)).toBe(false);
    client.flush();
    expect(storage.items.has(SESSION_KEY)).toBe(false);
    const fresh = await client.snapshot();
    expect(fresh.cards).toEqual([]);
    expect(fresh.log.entries.map((e) => e.kind)).toEqual(["MANDATE_SEALED"]);

    const reloaded = await boot();
    expect(reloaded.outcome).toBe("fresh");
    expect((await reloaded.snapshot()).mandate).toBeNull();
  });

  it("the new budget is kept again from its first purchase, with the new keys", async () => {
    const { boot, clock, storage } = start();
    const client = await boot();
    await client.seal(sealRequest(clock, 300));
    const oldKeys = (await client.exportLog()).publicKeys;
    await client.reset();
    await client.runScenario("normal");
    client.flush();
    expect(storage.items.has(SESSION_KEY)).toBe(true);
    const reloaded = await boot();
    expect(reloaded.outcome).toBe("restored");
    const keys = (await reloaded.exportLog()).publicKeys;
    expect(keys.engine).not.toEqual(oldKeys.engine);
    expect((await reloaded.snapshot()).cards).toHaveLength(1);
  });
});

describe("what is never kept", () => {
  it("the tamper demo's changed copy: the stored log is the real one, and a reload shows no copy", async () => {
    const { boot, clock, storage } = start();
    const client = await boot();
    await client.seal(sealRequest(clock, 800));
    await client.runScenario("normal");
    const view = await client.tamper();
    expect(view.tampered).not.toBeNull();
    client.flush();
    await client.runScenario("small"); // any new entry ends the demo; the save that follows holds the real log
    client.flush();
    const reloaded = await boot();
    expect(reloaded.outcome).toBe("restored");
    const log = await reloaded.getLog();
    expect(log.tampered).toBeNull();
    expect((await reloaded.verify()).result.ok).toBe(true);
    expect(storage.items.get(SESSION_KEY)).toBeDefined();
  });

  it("a tamper still up at the moment of the reload is not in the stored log either", async () => {
    const { boot, clock } = start();
    const client = await boot();
    await client.seal(sealRequest(clock, 800));
    await client.runScenario("normal");
    client.flush();
    await client.tamper();
    client.flush();
    const reloaded = await boot();
    expect((await reloaded.getLog()).tampered).toBeNull();
    expect((await reloaded.verify()).result.ok).toBe(true);
  });

  it("a family budget: not kept, and the record of the budget before it is removed (no stale rollback)", async () => {
    const { boot, clock, storage } = start();
    const client = await boot();
    await client.seal(sealRequest(clock, 300));
    client.flush();
    expect(storage.items.has(SESSION_KEY)).toBe(true);
    await client.seal({ ...sealRequest(clock, 500), family: { parent: "mum" } });
    client.flush();
    expect(storage.items.has(SESSION_KEY)).toBe(false);
    const reloaded = await boot();
    expect(reloaded.outcome).toBe("fresh");
    expect((await reloaded.snapshot()).mandate).toBeNull();
  });
});

describe("several tabs", () => {
  it("the last writer wins, whole: a reload shows the tab that wrote last", async () => {
    const { boot, clock, storage } = start();
    const a = await boot();
    await a.seal(sealRequest(clock, 800));
    a.flush();
    const b = await boot();
    await a.runScenario("normal");
    await b.runScenario("small");
    a.flush();
    b.flush();
    const reloaded = await boot();
    expect((await reloaded.snapshot()).cards.map((c) => c.limit_minor)).toEqual([12_000]);
    expect(storage.items.has(SESSION_KEY)).toBe(true);
  });

  it("a storage event from another tab changes nothing in this one (no live merging)", async () => {
    const { boot, clock, storage } = start();
    const client = await boot();
    await client.seal(sealRequest(clock, 800));
    await client.runScenario("normal");
    client.flush();
    const before = shown(await client.snapshot());
    const writes = storage.writes;
    window.dispatchEvent(new StorageEvent("storage", { key: SESSION_KEY, newValue: null, oldValue: "x" }));
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(shown(await client.snapshot())).toEqual(before);
    client.flush();
    expect(storage.writes).toBe(writes);
  });
});

describe("events and the page", () => {
  it("saves when the page goes away, with no help from the pause timer", async () => {
    const window = new EventTarget();
    const { boot, clock, storage } = start();
    const client = await boot({ page: { window, document: null } });
    await client.seal(sealRequest(clock, 300));
    expect(storage.items.has(SESSION_KEY)).toBe(false);
    window.dispatchEvent(new Event("pagehide"));
    expect(storage.items.has(SESSION_KEY)).toBe(true);
  });

  it("does not replay the stored entries to a subscriber that comes after the restore: only new entries arrive", async () => {
    const { boot, clock } = start();
    const before = await boot();
    await before.seal(sealRequest(clock, 300));
    await before.runScenario("small");
    before.flush();
    const after = await boot();
    const storedCount = (await after.snapshot()).log.entries.length;
    const events: TraceEvent[] = [];
    after.subscribe((e) => events.push(e));
    await after.runScenario("mint");
    const logged = events.flatMap((e) => (e.type === "log" ? [e.entry.seq] : []));
    expect(logged.length).toBeGreaterThan(0);
    expect(Math.min(...logged)).toBe(storedCount);
  });
});
