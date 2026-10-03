// @vitest-environment node
// The life of private wallets in the composed booth: the cap and the idle drop with the booth's own (fake) clock, the
// event stream of a dropped wallet, the switch (WALLY_SESSIONS), a wallet that cannot be made, no timer left after close,
// and the header the native shells use. Real stack, replay judge and planner, no port.
import { FakeClock } from "@wally/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Booth } from "../../server/compose";
import { SESSION_IDLE_TTL_MS } from "../../server/sessions";
import { orchestratorIsReal } from "./support/realStack";
import { bootLan, macOf, phonesOf, Phone, testLan } from "./support/phones";
import { readSse } from "./support/sse";

const REAL = await orchestratorIsReal();
const MINUTE = 60_000;
const booths: Booth[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const b of booths.splice(0)) await b.close();
});

async function boot(...args: Parameters<typeof bootLan>): Promise<Booth> {
  const booth = await bootLan(...args);
  booths.push(booth);
  return booth;
}

const cards = async (p: Phone): Promise<number> => (await p.snapshot()).cards.length;
const tick = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!REAL)("the cap", () => {
  it("drops the wallet nobody has used longest when one visitor too many comes; its owner meets a fresh one, not an error", async () => {
    const booth = await boot({ sessionLimits: { maxVisitors: 3, recentMs: 0 } });
    const [a, b, c, d] = phonesOf(booth, 4) as [Phone, Phone, Phone, Phone];
    await a.run("normal");
    await b.run("normal");
    await c.run("normal");
    await a.snapshot(); // a is used again, so b is the one nobody has touched longest
    await d.snapshot();
    expect(booth.sessions?.size).toBe(3);
    expect(booth.sessions?.stats().evicted).toBe(1);
    expect(await cards(a)).toBe(1);
    expect(await cards(c)).toBe(1);
    const oldB = b.sessionId;
    expect(await cards(b)).toBe(0);
    expect(b.sessionId).not.toBe(oldB);
  });

  it("never drops a wallet whose page is open: the next phone is told the booth is full (503), and the open page keeps its stream", async () => {
    const booth = await boot({ sessionLimits: { maxVisitors: 1, recentMs: 0 } });
    const [a, b] = phonesOf(booth, 2) as [Phone, Phone];
    const reader = (await a.get("/api/events")).body?.getReader();
    await reader?.read(); // the ready comment
    const turned = await b.get("/api/info");
    expect(turned.status).toBe(503);
    const body = (await turned.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("SESSION_UNAVAILABLE");
    expect(body.error.message).toMatch(/in use/i);
    expect(turned.headers.getSetCookie()).toEqual([]);
    expect(booth.sessions?.stats()).toMatchObject({ live: 1, evicted: 0, refused: 1 });
    await Promise.race([reader?.read().then(() => "ended"), tick(50).then(() => "still open")]).then((state) => expect(state).toBe("still open"));
    await reader?.cancel(); // the page goes: its wallet can be dropped for the phone that was turned away
    expect((await b.get("/api/info")).status).toBe(200);
    expect(booth.sessions?.stats()).toMatchObject({ live: 1, evicted: 1 });
  });

  it("does not cascade when more pages than wallets keep reconnecting: 13 pages at a cap of 12 make 12 wallets and drop none", async () => {
    const booth = await boot({ sessionLimits: { maxVisitors: 12, recentMs: 0 } });
    const phones = phonesOf(booth, 13);
    const streams = new Map<number, ReadableStreamDefaultReader<Uint8Array>>();
    // As the app's event stream does: ask again with the old cookie whenever the answer is not a stream (or it ended).
    for (let round = 0; round < 6; round += 1) {
      await Promise.all(
        phones.map(async (phone, i) => {
          if (streams.has(i)) return;
          const res = await phone.get("/api/events");
          if (res.ok && res.body !== null) streams.set(i, res.body.getReader());
          else await res.body?.cancel();
        }),
      );
    }
    const stats = booth.sessions?.stats();
    expect(stats).toMatchObject({ live: 12, created: 12, evicted: 0 });
    expect(stats?.refused).toBeGreaterThan(0); // the 13th page was turned away every round, and made nothing
    expect(streams.size).toBe(12);
    for (const reader of streams.values()) await reader.cancel();
  });
});

describe.skipIf(!REAL)("the idle drop", () => {
  it("drops a wallet 45 minutes after its last request on the booth's clock, and its owner gets a fresh one", async () => {
    const clock = new FakeClock();
    const booth = await boot({ clock });
    const [a, b] = phonesOf(booth, 2) as [Phone, Phone];
    await a.run("normal");
    await b.run("normal");
    clock.advance(30 * MINUTE);
    await b.snapshot(); // b is used again
    clock.advance(SESSION_IDLE_TTL_MS - 30 * MINUTE);
    expect(booth.sessions?.sweep()).toBe(1);
    expect(booth.sessions?.size).toBe(1);
    expect(await cards(b)).toBe(1);
    const oldA = a.sessionId;
    expect(await cards(a)).toBe(0);
    expect(a.sessionId).not.toBe(oldA);
    expect(booth.sessions?.stats().expired).toBe(1);
  });

  it("keeps a wallet whose page still has its event stream open", async () => {
    const clock = new FakeClock();
    const booth = await boot({ clock });
    const [a] = phonesOf(booth, 1) as [Phone];
    await a.run("normal");
    const stream = (await a.get("/api/events")).body?.getReader();
    clock.advance(SESSION_IDLE_TTL_MS * 2);
    expect(booth.sessions?.sweep()).toBe(0);
    expect(await cards(a)).toBe(1);
    await stream?.cancel();
  });

  it("ticks each wallet itself: a question a visitor left open runs out on its page's stream without any request", async () => {
    const clock = new FakeClock();
    const booth = await boot({ clock });
    const [a] = phonesOf(booth, 1) as [Phone];
    await a.info();
    const stream = readSse((await a.get("/api/events")).body as ReadableStream<Uint8Array>);
    await stream.until(() => stream.comments.some((c) => c.startsWith("ready")));
    await a.run("unverified");
    clock.advance(61_000); // the 60 s window of R11 [F31]
    await booth.sessions?.tickAll();
    await stream.until((m) => m.some((x) => x.event.type === "escalation" && x.event.escalation.state === "EXPIRED"));
    await stream.close();
  });
});

describe.skipIf(!REAL)("a wallet whose log grows without end", () => {
  it("takes runs up to a limit, then turns them away (409) until the demo is started over; reads keep working; the Mac has no such limit", async () => {
    const booth = await boot({ sessionLimits: { maxEntries: 12 } });
    const [a] = phonesOf(booth, 1) as [Phone];
    const mac = macOf(booth);
    let refused: { status: number; code: string } | null = null;
    for (let i = 0; i < 30 && refused === null; i += 1) {
      const res = await a.post("/api/scenario/normal");
      if (res.status !== 200) refused = { status: res.status, code: ((await res.json()) as { error: { code: string } }).error.code };
    }
    expect(refused).toEqual({ status: 409, code: "WALLET_FULL" });
    expect((await a.snapshot()).log.entries.length).toBeGreaterThanOrEqual(12);
    expect((await a.verify()).result.ok).toBe(true); // reads and checks still work
    expect((await a.post("/api/propose", { listingText: "Plain tee." })).status).toBe(409); // every run is turned away, not only one kind
    expect((await a.post("/api/reset")).status).toBe(204); // starting the demo over
    expect((await a.run("normal")).outcome).toBe("APPROVE");
    for (let i = 0; i < 6; i += 1) await mac.run("small"); // the Mac's wallet is not capped
    expect((await mac.snapshot()).log.entries.length).toBeGreaterThan(12);
  });
});

describe.skipIf(!REAL)("the switch", () => {
  it("is on by default in LAN mode and off without it", async () => {
    expect((await boot()).sessions).not.toBeNull();
    const noLan = await boot({ lan: undefined as never });
    expect(noLan.sessions).toBeNull();
  });

  it("WALLY_SESSIONS=off keeps the one shared wallet: phones see each other, no cookie, no sessions field", async () => {
    const booth = await boot({ env: { WALLY_SESSIONS: "off" } });
    expect(booth.sessions).toBeNull();
    const [a, b] = phonesOf(booth, 2) as [Phone, Phone];
    const first = await a.get("/api/info");
    expect(first.headers.getSetCookie()).toEqual([]);
    expect(((await first.json()) as { sessions?: string }).sessions).toBeUndefined();
    await a.run("normal");
    expect(await cards(b)).toBe(1); // b sees a's card
    expect(await cards(macOf(booth))).toBe(1); // and so does the Mac: one wallet, as before
  });

  it("fails closed to off on a value it does not know, and says so", async () => {
    const errors: string[] = [];
    const booth = await boot({ env: { WALLY_SESSIONS: "yes" }, logger: { info: () => undefined, error: (m) => void errors.push(m) } });
    expect(booth.sessions).toBeNull();
    expect(errors.join("\n")).toMatch(/WALLY_SESSIONS=yes/);
  });

  it("WALLY_SESSIONS=on without LAN mode changes nothing: every caller is the Mac", async () => {
    const booth = await boot({ env: { WALLY_SESSIONS: "on" }, lan: undefined as never });
    expect(booth.sessions).not.toBeNull();
    const mac = macOf(booth);
    expect((await mac.info()).sessions).toBe("shared");
    await mac.run("normal");
    expect(booth.sessions?.size).toBe(0);
  });
});

describe.skipIf(!REAL)("a wallet that cannot be made", () => {
  it("answers 503 in the usual JSON error shape, says nothing internal, makes no wallet, and sets no cookie", async () => {
    const errors: string[] = [];
    const booth = await boot({
      logger: { info: () => undefined, error: (m) => void errors.push(m) },
      visitorStore: () => {
        throw new Error("disk is full at /home/user/.data");
      },
    });
    const [a] = phonesOf(booth, 1) as [Phone];
    const res = await a.get("/api/info");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("SESSION_UNAVAILABLE");
    expect(body.error.message).not.toMatch(/disk|Users/);
    expect(errors.join("\n")).toMatch(/disk is full/);
    expect(booth.sessions?.size).toBe(0);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect((await macOf(booth).info()).sessions).toBe("shared"); // the Mac does not need a new wallet and is not affected
  });
});

describe.skipIf(!REAL)("close", () => {
  it("leaves no timer behind, with wallets made and event streams open", async () => {
    vi.useFakeTimers();
    const booth = await bootLan({ tickMs: 1_000 });
    const phones = phonesOf(booth, 3);
    for (const p of phones) await p.run("normal");
    const streams = await Promise.all(phones.map(async (p) => (await p.get("/api/events")).body?.getReader()));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await booth.close();
    expect(vi.getTimerCount()).toBe(0);
    expect(booth.sessions?.size).toBe(0);
    for (const s of streams) await s?.cancel().catch(() => undefined);
  });

  it("ends every visitor's event stream and refuses new visitors afterwards", async () => {
    const booth = await boot();
    const [a, late] = phonesOf(booth, 2) as [Phone, Phone];
    await a.info();
    const reader = (await a.get("/api/events")).body?.getReader();
    await reader?.read();
    await booth.close();
    expect((await reader?.read())?.done).toBe(true);
    expect((await late.get("/api/info")).status).toBe(503);
  });
});

describe.skipIf(!REAL)("how fast a wallet is made", () => {
  it("is recorded for each wallet, and twelve of them take well under a second each on this stack", async () => {
    const booth = await boot();
    for (const p of phonesOf(booth, 12)) await p.info();
    const stats = booth.sessions?.stats();
    expect(stats?.created).toBe(12);
    expect(stats?.lastCreateMs).not.toBeNull();
    expect(stats?.maxCreateMs ?? Infinity).toBeLessThan(1_000);
  });
});

describe.skipIf(!REAL)("the native shells", () => {
  const NATIVE = { origin: "capacitor://localhost" };

  it("answer the preflight with X-Wally-Session allowed, and expose it on real answers", async () => {
    const booth = await boot();
    const shell = new Phone(booth.app, { cookies: false, token: false });
    const pre = await shell.call("/api/seal", { method: "OPTIONS" }, { ...NATIVE, "access-control-request-method": "POST", "access-control-request-headers": "content-type, x-wally-token, x-wally-session" });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-headers")).toBe("content-type, x-wally-token, x-wally-session");
    expect(booth.sessions?.size).toBe(0); // a preflight never makes a wallet
    const real = new Phone(booth.app, { cookies: false, headers: NATIVE });
    const res = await real.get("/api/info");
    expect(res.headers.get("access-control-expose-headers")).toBe("x-event-seq, x-wally-session");
    expect(res.headers.get("x-wally-session")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("learn their id from the first answer and keep the same wallet by sending it back", async () => {
    const booth = await boot();
    const shell = new Phone(booth.app, { cookies: false, headers: NATIVE });
    const id = (await shell.get("/api/info")).headers.get("x-wally-session") ?? "";
    await shell.post("/api/scenario/normal", {}, { "x-wally-session": id });
    const snap = await shell.get("/api/snapshot", { "x-wally-session": id });
    expect(snap.headers.get("x-wally-session")).toBe(id);
    expect(((await snap.json()) as { cards: unknown[] }).cards).toHaveLength(1);
    expect(booth.sessions?.size).toBe(1);
  });

  it("keep the old CORS headers exactly when the switch is off", async () => {
    const booth = await boot({ env: { WALLY_SESSIONS: "off" }, lan: testLan() });
    const shell = new Phone(booth.app, { cookies: false, token: false });
    const pre = await shell.call("/api/seal", { method: "OPTIONS" }, { ...NATIVE, "access-control-request-method": "POST" });
    expect(pre.headers.get("access-control-allow-headers")).toBe("content-type, x-wally-token");
    const real = new Phone(booth.app, { cookies: false, headers: NATIVE });
    const res = await real.get("/api/info");
    expect(res.headers.get("access-control-expose-headers")).toBe("x-event-seq");
    expect(res.headers.get("x-wally-session")).toBeNull();
  });
});
