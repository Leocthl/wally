// @vitest-environment node
// The registry of private practice wallets (server/sessions.ts): who gets the shared booth wallet, who gets a wallet of
// their own, how many there can be, when one is dropped. No HTTP here: a fake clock, fake wallets, fake timers.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoothBackend } from "../../server/backend";
import { BoothError } from "../../server/http/errors";
import { SseHub } from "../../server/http/sse";
import {
  MAX_VISITOR_SESSIONS,
  newSessionId,
  REPLACEMENT_WINDOW_MS,
  SESSION_ID_RE,
  SESSION_IDLE_TTL_MS,
  SESSION_TICK_MS,
  SessionRegistry,
  sessionsModeFromEnv,
  type SessionRegistryOptions,
  type SessionScope,
  type VisitorSession,
} from "../../server/sessions";

const MINUTE = 60_000;
const hubs: SseHub[] = [];

function hub(): SseHub {
  const made = new SseHub({ keepAliveMs: 60_000, maxQueuedChunks: 8 });
  hubs.push(made);
  return made;
}

interface Fake extends VisitorSession {
  readonly closed: () => number;
  readonly ticks: () => number;
}

function fakeVisitor(): Fake {
  const own = hub();
  let closed = 0;
  let ticks = 0;
  return {
    backend: {} as BoothBackend,
    hub: own,
    tick: async () => {
      ticks += 1;
    },
    close: () => {
      closed += 1;
      own.close(); // the real wallet closes its event hub too
    },
    closed: () => closed,
    ticks: () => ticks,
  };
}

const BOOTH: SessionScope = { backend: {} as BoothBackend, hub: hub() };

/** A registry on a clock the test moves by hand; every wallet it makes is kept so the test can look at it. */
function setup(over: Partial<SessionRegistryOptions> = {}) {
  let now = 1_000_000;
  let counter = 0;
  const made: Fake[] = [];
  const registry = new SessionRegistry({
    booth: BOOTH,
    create: async () => {
      const visitor = fakeVisitor();
      made.push(visitor);
      return visitor;
    },
    now: () => now,
    newId: () => {
      counter += 1;
      return counter.toString(16).padStart(32, "0");
    },
    tickMs: null,
    recentMs: 0,
    ...over,
  });
  return { registry, made, advance: (ms: number) => void (now += ms), clock: () => now };
}

const phone = (presented: string | null = null) => ({ booth: false, presented });
const idOf = async (registry: SessionRegistry, presented: string | null = null): Promise<string> => {
  const found = await registry.resolve(phone(presented));
  if (found.kind !== "visitor") throw new Error("expected a visitor wallet");
  return found.id;
};

afterEach(() => {
  vi.useRealTimers();
  for (const h of hubs.splice(0)) h.close();
});

describe("who gets which wallet", () => {
  it("gives the booth Mac the shared wallet, whatever id it carries, and never makes a wallet for it", async () => {
    const create = vi.fn(async () => fakeVisitor());
    const { registry } = setup({ create });
    for (const presented of [null, "f".repeat(32), "not an id"]) {
      const found = await registry.resolve({ booth: true, presented });
      expect(found).toEqual({ kind: "booth", scope: BOOTH });
    }
    expect(create).not.toHaveBeenCalled();
    expect(registry.size).toBe(0);
  });

  it("makes a wallet on a visitor's first request and gives the same one back for its id", async () => {
    const { registry, made } = setup();
    const first = await registry.resolve(phone());
    expect(first.kind).toBe("visitor");
    const id = first.kind === "visitor" ? first.id : "";
    expect(id).toMatch(SESSION_ID_RE);
    const again = await registry.resolve(phone(id));
    expect(again).toMatchObject({ kind: "visitor", id });
    expect(again.scope).toBe(first.scope);
    expect(made).toHaveLength(1);
    expect(registry.size).toBe(1);
  });

  it("gives two visitors with no id two wallets with two ids", async () => {
    const { registry, made } = setup();
    const a = await idOf(registry);
    const b = await idOf(registry);
    expect(a).not.toBe(b);
    expect(made).toHaveLength(2);
    expect(registry.size).toBe(2);
  });

  it("gives an id it does not know a fresh wallet under a new id, never an error and never the id it was handed", async () => {
    const { registry } = setup();
    const stranger = "a".repeat(32);
    const id = await idOf(registry, stranger);
    expect(id).not.toBe(stranger);
    expect(registry.has(stranger)).toBe(false);
    expect(registry.size).toBe(1);
  });

  it("treats an id of the wrong shape like no id", async () => {
    const { registry } = setup();
    for (const odd of ["", "../../etc", "g".repeat(32), "A".repeat(32), "a".repeat(31), "a".repeat(33)]) {
      expect(await idOf(registry, odd)).toMatch(SESSION_ID_RE);
    }
    expect(registry.size).toBe(6);
  });
});

describe("limits", () => {
  it("allows 12 visitor wallets by default and 45 minutes idle", () => {
    expect(MAX_VISITOR_SESSIONS).toBe(12);
    expect(SESSION_IDLE_TTL_MS).toBe(45 * MINUTE);
  });

  it("drops the least recently used wallet to make room, and closes it", async () => {
    const { registry, made, advance } = setup({ maxVisitors: 3 });
    const a = await idOf(registry);
    advance(1_000);
    const b = await idOf(registry);
    advance(1_000);
    const c = await idOf(registry);
    advance(1_000);
    await registry.resolve(phone(a)); // a is used again: b is now the one nobody has touched longest
    advance(1_000);
    const d = await idOf(registry);
    expect(registry.size).toBe(3);
    expect(registry.has(b)).toBe(false);
    expect([a, c, d].every((id) => registry.has(id))).toBe(true);
    expect(made[1]?.closed()).toBe(1);
    expect(made.filter((m) => m.closed() > 0)).toHaveLength(1);
    expect(registry.stats().evicted).toBe(1);
    // the dropped wallet's id now meets a fresh one: the visitor loses the old wallet, not the service
    const back = await idOf(registry, b);
    expect(back).not.toBe(b);
  });

  it("tells which wallet was used longest ago even when every use is in the same millisecond", async () => {
    const ctx = setup({ maxVisitors: 3 }); // the clock does not move at all
    const a = await idOf(ctx.registry);
    const b = await idOf(ctx.registry);
    const c = await idOf(ctx.registry);
    await ctx.registry.resolve(phone(a)); // a is used again, after b and c were made
    const d = await idOf(ctx.registry);
    expect(ctx.registry.has(b)).toBe(false);
    expect([a, c, d].every((id) => ctx.registry.has(id))).toBe(true);
  });

  it("never lets the number of wallets pass the cap, however many visitors come", async () => {
    const { registry, made } = setup({ maxVisitors: 4 });
    for (let i = 0; i < 20; i += 1) await idOf(registry);
    expect(registry.size).toBe(4);
    expect(made.filter((m) => m.closed() === 0)).toHaveLength(4);
  });

  it("drops a wallet 45 minutes after its last use, not before", async () => {
    const { registry, made, advance } = setup();
    const id = await idOf(registry);
    advance(SESSION_IDLE_TTL_MS - 1);
    expect(registry.sweep()).toBe(0);
    expect(registry.has(id)).toBe(true);
    advance(1);
    expect(registry.sweep()).toBe(1);
    expect(registry.has(id)).toBe(false);
    expect(made[0]?.closed()).toBe(1);
    expect(registry.stats().expired).toBe(1);
  });

  it("counts the idle time from the last request, so a wallet in use stays", async () => {
    const { registry, advance } = setup();
    const id = await idOf(registry);
    for (let i = 0; i < 5; i += 1) {
      advance(SESSION_IDLE_TTL_MS - MINUTE);
      await registry.resolve(phone(id));
      expect(registry.sweep()).toBe(0);
    }
    expect(registry.has(id)).toBe(true);
  });

  it("gives a visitor who comes back with an expired id a fresh wallet at once, even before the sweep ran", async () => {
    const { registry, made, advance } = setup();
    const old = await idOf(registry);
    advance(SESSION_IDLE_TTL_MS + MINUTE);
    const fresh = await idOf(registry, old);
    expect(fresh).not.toBe(old);
    expect(registry.has(old)).toBe(false);
    expect(made[0]?.closed()).toBe(1);
    expect(registry.size).toBe(1);
  });

  it("does not drop a wallet while a page has its event stream open, and gives it a whole idle time after the page goes", async () => {
    const { registry, made, advance } = setup();
    const id = await idOf(registry);
    const stream = made[0]?.hub.connect();
    advance(SESSION_IDLE_TTL_MS * 3);
    expect(registry.sweep()).toBe(0); // the page is open: in use
    expect(registry.has(id)).toBe(true);
    await stream?.body?.cancel(); // the phone locks after an hour of reading
    expect(registry.sweep()).toBe(0); // not dropped at the next sweep: the idle time restarted while the page was open
    advance(SESSION_IDLE_TTL_MS - 1);
    expect(registry.sweep()).toBe(0);
    advance(1);
    expect(registry.sweep()).toBe(1);
    expect(registry.has(id)).toBe(false);
  });
});

describe("a booth that is full", () => {
  const page = (visitor: Fake | undefined) => visitor?.hub.connect();

  /** A `create` that counts its calls and keeps the wallets it makes where the test can see them. */
  const counting = () => {
    const made: Fake[] = [];
    const create = vi.fn(async () => {
      const visitor = fakeVisitor();
      made.push(visitor);
      return visitor;
    });
    return { made, create };
  };

  it("never drops a wallet that has a page open: the next visitor is told it is full, at once, and no wallet is made", async () => {
    const { made, create } = counting();
    const ctx = setup({ maxVisitors: 2, create });
    await idOf(ctx.registry);
    await idOf(ctx.registry);
    expect(create).toHaveBeenCalledTimes(2);
    const pages = [page(made[0]), page(made[1])];
    const turned = await ctx.registry.resolve(phone()).catch((err: unknown) => err);
    expect(turned).toBeInstanceOf(BoothError);
    expect(turned).toMatchObject({ status: 503, code: "SESSION_UNAVAILABLE" });
    expect(String((turned as Error).message)).toMatch(/in use/i);
    expect(create).toHaveBeenCalledTimes(2); // no work was done for the visitor who was turned away
    expect(ctx.registry.stats()).toMatchObject({ live: 2, evicted: 0, refused: 1 });
    expect(made.map((m) => m.closed())).toEqual([0, 0]);
    await Promise.all(pages.map((p) => p?.body?.cancel()));
  });

  it("drops, among the wallets that have no page, the one used longest ago, and keeps a page's wallet even when it is the oldest", async () => {
    const ctx = setup({ maxVisitors: 3 });
    const a = await idOf(ctx.registry);
    ctx.advance(1_000);
    const b = await idOf(ctx.registry);
    ctx.advance(1_000);
    const c = await idOf(ctx.registry);
    ctx.advance(1_000);
    const open = page(ctx.made[0]); // a is the oldest and has a page
    const d = await idOf(ctx.registry);
    expect(ctx.registry.has(a)).toBe(true);
    expect(ctx.registry.has(b)).toBe(false); // the oldest without a page
    expect([c, d].every((id) => ctx.registry.has(id))).toBe(true);
    await open?.body?.cancel();
  });

  it("makes room again as soon as a page goes", async () => {
    const ctx = setup({ maxVisitors: 2 });
    await idOf(ctx.registry);
    await idOf(ctx.registry);
    const pages = [page(ctx.made[0]), page(ctx.made[1])];
    await expect(ctx.registry.resolve(phone())).rejects.toMatchObject({ status: 503 });
    await pages[1]?.body?.cancel();
    expect(await idOf(ctx.registry)).toMatch(SESSION_ID_RE);
    expect(ctx.made[1]?.closed()).toBe(1);
    expect(ctx.made[0]?.closed()).toBe(0);
    await pages[0]?.body?.cancel();
  });

  it("does not drop a wallet that was used just now, so a request still using it is not cut off", async () => {
    const ctx = setup({ maxVisitors: 2, recentMs: 5_000 });
    await idOf(ctx.registry);
    ctx.advance(1_000);
    await idOf(ctx.registry);
    ctx.advance(1_000);
    await expect(ctx.registry.resolve(phone())).rejects.toMatchObject({ status: 503 });
    ctx.advance(4_000); // the first wallet was last used 6 s ago, the second 5 s ago
    expect(await idOf(ctx.registry)).toMatch(SESSION_ID_RE);
    expect(ctx.made.map((m) => m.closed())).toEqual([1, 0, 0]);
  });

  it("makes at most the cap when many first requests arrive together: the rest are turned away, and nobody is handed a closed wallet", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const made: Fake[] = [];
    const ctx = setup({
      maxVisitors: 12,
      create: async () => {
        await gate; // all thirteen are in flight at once
        const visitor = fakeVisitor();
        made.push(visitor);
        return visitor;
      },
    });
    const all = Promise.allSettled(Array.from({ length: 13 }, () => ctx.registry.resolve(phone())));
    release();
    const results = await all;
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(12);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(made.filter((m) => m.closed() > 0)).toHaveLength(0);
    expect(ctx.registry.size).toBe(12);
  });

  it("asks nothing of the machine for a visitor it turns away again and again, and keeps the log short", async () => {
    const lines: string[] = [];
    const { made, create } = counting();
    const ctx = setup({ maxVisitors: 1, create, logger: { info: (m) => void lines.push(m), error: () => undefined } });
    await idOf(ctx.registry);
    const open = page(made[0]);
    for (let i = 0; i < 50; i += 1) await expect(ctx.registry.resolve(phone())).rejects.toMatchObject({ status: 503 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(ctx.registry.stats().refused).toBe(50);
    expect(lines.filter((l) => l.includes("refused"))).toHaveLength(1);
    ctx.advance(10_000);
    await expect(ctx.registry.resolve(phone())).rejects.toMatchObject({ status: 503 });
    expect(lines.filter((l) => l.includes("refused"))).toHaveLength(2);
    await open?.body?.cancel();
  });
});

describe("parallel requests from one page", () => {
  it("makes one wallet for requests that all carry the same id nobody knows (a page that woke up after its wallet was dropped)", async () => {
    const { registry, made } = setup();
    const stale = "b".repeat(32);
    const [x, y, z] = await Promise.all([idOf(registry, stale), idOf(registry, stale), idOf(registry, stale)]);
    expect(new Set([x, y, z]).size).toBe(1);
    expect(made).toHaveLength(1);
  });

  it("keeps handing that wallet to late requests that still carry the old id, for a short while only", async () => {
    const { registry, made, advance } = setup();
    const stale = "c".repeat(32);
    const first = await idOf(registry, stale);
    advance(REPLACEMENT_WINDOW_MS - 1);
    expect(await idOf(registry, stale)).toBe(first);
    expect(made).toHaveLength(1);
    advance(2);
    const later = await idOf(registry, stale);
    expect(later).not.toBe(first);
    expect(made).toHaveLength(2);
  });

  it("makes a wallet for each request that carries no id (it cannot tell two phones from one page)", async () => {
    const { registry, made } = setup();
    await Promise.all([idOf(registry), idOf(registry), idOf(registry)]);
    expect(made).toHaveLength(3);
  });

  it("remembers at most 64 old ids, and forgets them when their window is over", async () => {
    const ctx = setup({ maxVisitors: 4 });
    for (let i = 0; i < 200; i += 1) await idOf(ctx.registry, i.toString(16).padStart(32, "0"));
    expect(ctx.registry.remembered).toBeLessThanOrEqual(64);
    expect(ctx.registry.remembered).toBeGreaterThan(0);
    ctx.advance(REPLACEMENT_WINDOW_MS);
    await idOf(ctx.registry, "f".repeat(32));
    expect(ctx.registry.remembered).toBe(1);
  });

  it("does not hand a dropped wallet's replacement to a request for a different old id", async () => {
    const { registry } = setup();
    const a = await idOf(registry, "d".repeat(32));
    const b = await idOf(registry, "e".repeat(32));
    expect(a).not.toBe(b);
  });
});

describe("a wallet that cannot be made", () => {
  it("answers 503 with a plain message, logs the cause, and keeps nothing half made", async () => {
    const errors: string[] = [];
    let failing = true;
    const { registry } = setup({
      create: async () => {
        if (failing) throw new Error("keys unreadable: /Users/x/.keys");
        return fakeVisitor();
      },
      logger: { info: () => undefined, error: (m) => void errors.push(m) },
    });
    const failure = await registry.resolve(phone()).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(BoothError);
    expect(failure).toMatchObject({ status: 503, code: "SESSION_UNAVAILABLE" });
    expect(String((failure as Error).message)).not.toMatch(/keys|Users/); // nothing internal reaches the visitor
    expect(errors.join("\n")).toContain("keys unreadable");
    expect(registry.size).toBe(0);
    failing = false;
    expect(await idOf(registry)).toMatch(SESSION_ID_RE); // the next visitor is served
  });

  it("lets a second try with the same old id make a wallet after the first try failed", async () => {
    let failing = true;
    const { registry } = setup({
      create: async () => {
        if (failing) throw new Error("boom");
        return fakeVisitor();
      },
    });
    const stale = "9".repeat(32);
    await expect(registry.resolve(phone(stale))).rejects.toMatchObject({ status: 503 });
    failing = false;
    expect(await idOf(registry, stale)).toMatch(SESSION_ID_RE);
  });
});

describe("timers and close", () => {
  it("ticks the visitor wallets that have a page open on the interval, never the booth, and drops idle ones", async () => {
    vi.useFakeTimers();
    const { registry, made, advance } = setup({ tickMs: 1_000 });
    await idOf(registry);
    await idOf(registry);
    const pages = made.map((m) => m.hub.connect());
    await vi.advanceTimersByTimeAsync(3_000);
    expect(made.map((m) => m.ticks())).toEqual([3, 3]);
    await Promise.all(pages.map((p) => p.body?.cancel()));
    advance(SESSION_IDLE_TTL_MS);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(registry.size).toBe(0);
    registry.close();
  });

  it("does not tick a wallet nobody has a page open on: its next request ticks it first", async () => {
    vi.useFakeTimers();
    const { registry, made } = setup({ tickMs: 1_000 });
    await idOf(registry);
    const watched = made[0];
    const page = watched?.hub.connect();
    await idOf(registry);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(made.map((m) => m.ticks())).toEqual([2, 0]);
    await page?.body?.cancel();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(made.map((m) => m.ticks())).toEqual([2, 0]);
    registry.close();
  });

  it("beats every 5 seconds by default: a tick reads the whole log, and twelve wallets at 1 s used 60% of a core", async () => {
    expect(SESSION_TICK_MS).toBe(5_000);
    vi.useFakeTimers();
    const made: Fake[] = [];
    const registry = new SessionRegistry({
      booth: BOOTH,
      create: async () => {
        const visitor = fakeVisitor();
        made.push(visitor);
        return visitor;
      },
    });
    await idOf(registry);
    const page = made[0]?.hub.connect();
    await vi.advanceTimersByTimeAsync(4_900);
    expect(made[0]?.ticks()).toBe(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(made[0]?.ticks()).toBe(1);
    await page?.body?.cancel();
    registry.close();
  });

  it("logs a wallet whose tick failed and keeps ticking the others", async () => {
    vi.useFakeTimers();
    const errors: string[] = [];
    const made: Fake[] = [];
    const ctx = setup({
      tickMs: 1_000,
      logger: { info: () => undefined, error: (m) => void errors.push(m) },
      create: async () => {
        const visitor = fakeVisitor();
        made.push(visitor);
        return made.length === 1 ? { ...visitor, tick: () => Promise.reject(new Error("orchestrator broke")) } : visitor;
      },
    });
    await idOf(ctx.registry);
    await idOf(ctx.registry);
    const pages = made.map((m) => m.hub.connect());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(made[1]?.ticks()).toBe(1);
    expect(errors.join("\n")).toContain("tick failed: orchestrator broke");
    await Promise.all(pages.map((p) => p.body?.cancel()));
    ctx.registry.close();
  });

  it("turns an unexpected error in its own upkeep into a log line, not an unhandled rejection that ends the process", async () => {
    vi.useFakeTimers();
    const errors: string[] = [];
    const ctx = setup({
      tickMs: 1_000,
      logger: {
        info: (m) => {
          if (m.includes("dropped")) throw new Error("log sink broke");
        },
        error: (m) => void errors.push(m),
      },
    });
    await idOf(ctx.registry);
    ctx.advance(SESSION_IDLE_TTL_MS);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(errors.join("\n")).toContain("upkeep failed: log sink broke");
    ctx.registry.close();
  });

  it("clears its timer on close and leaves none behind", async () => {
    vi.useFakeTimers();
    const before = vi.getTimerCount();
    const { registry, made } = setup({ tickMs: 1_000 });
    expect(vi.getTimerCount()).toBe(before + 1);
    await idOf(registry);
    registry.close();
    expect(vi.getTimerCount()).toBe(before);
    expect(made[0]?.closed()).toBe(1);
    expect(registry.size).toBe(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(made[0]?.ticks()).toBe(0);
    registry.close(); // a second close does nothing
  });

  it("refuses new visitors after close (503) but still serves the booth", async () => {
    const { registry } = setup();
    registry.close();
    await expect(registry.resolve(phone())).rejects.toMatchObject({ status: 503, code: "SESSION_UNAVAILABLE" });
    expect(await registry.resolve({ booth: true, presented: null })).toEqual({ kind: "booth", scope: BOOTH });
  });

  it("closes a wallet that finished being made after close ran, and answers that visitor 503", async () => {
    let release: (v: VisitorSession) => void = () => undefined;
    const slow = fakeVisitor();
    const { registry } = setup({ create: () => new Promise<VisitorSession>((resolve) => (release = resolve)) });
    const pending = registry.resolve(phone()).catch((err: unknown) => err);
    registry.close();
    release(slow);
    expect(await pending).toMatchObject({ status: 503 });
    expect(slow.closed()).toBe(1);
  });
});

describe("measuring", () => {
  it("records how long the last and the slowest wallet took to make, on its own timer, not the wall clock", async () => {
    const timings = [40, 90, 20];
    let elapsed = 0;
    const ctx = setup({
      create: async () => {
        elapsed += timings.shift() ?? 0;
        return fakeVisitor();
      },
      timer: () => elapsed,
    });
    for (let i = 0; i < 3; i += 1) await idOf(ctx.registry);
    expect(ctx.registry.stats()).toMatchObject({ live: 3, created: 3, lastCreateMs: 20, maxCreateMs: 90 });
  });

  it("has nothing to report before the first wallet", () => {
    expect(setup().registry.stats()).toEqual({ live: 0, created: 0, evicted: 0, expired: 0, refused: 0, lastCreateMs: null, maxCreateMs: null });
  });
});

describe("ids", () => {
  it("are 128 random bits as 32 lower-case hex characters, new each time", () => {
    const a = newSessionId();
    expect(a).toMatch(SESSION_ID_RE);
    expect(newSessionId()).not.toBe(a);
    expect(newSessionId((bytes) => bytes.fill(255))).toBe("ff".repeat(16));
  });
});

describe("WALLY_SESSIONS", () => {
  it.each([
    [{}, true, "on"],
    [{}, false, "off"],
    [{ WALLY_SESSIONS: "" }, true, "on"],
    [{ WALLY_SESSIONS: "   " }, false, "off"],
    [{ WALLY_SESSIONS: "on" }, true, "on"],
    [{ WALLY_SESSIONS: "on" }, false, "on"],
    [{ WALLY_SESSIONS: "off" }, true, "off"],
    [{ WALLY_SESSIONS: " ON " }, false, "on"],
    [{ WALLY_SESSIONS: "Off" }, true, "off"],
  ] as const)("%j with LAN mode %s is %s", (env, lan, mode) => {
    expect(sessionsModeFromEnv(env, lan)).toEqual({ mode, note: null });
  });

  it.each(["true", "1", "yes", "enabled", "maybe", "on off", "0"])("an unknown value (%s) fails closed to off and says so", (value) => {
    const found = sessionsModeFromEnv({ WALLY_SESSIONS: value }, true);
    expect(found.mode).toBe("off");
    expect(found.note).toContain("WALLY_SESSIONS");
    expect(found.note).toContain(value);
  });
});
