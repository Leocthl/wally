// How persistence plugs into the composition: which keys each session gets, which store it logs to, and what a resumed
// first session changes (the stored mandate id, a playback random source, an orchestrator whose seal is the stored seal).
import { FakeClock } from "@wally/core/testing";
import { seededRandom } from "@wally/rail-sim";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionDeps } from "../../src/booth/backend/session";
import { planRestore, type RestorePlan } from "../../src/api/local/persist/plan";
import { decodeRecord, SESSION_KEY } from "../../src/api/local/persist/record";
import { PlaybackRandom } from "../../src/api/local/persist/rail";
import { FreezableClock } from "../../src/api/local/persist/resume";
import { SessionSaver } from "../../src/api/local/persist/saver";
import { SessionLogStore } from "../../src/api/local/persist/store";
import { persistWiring } from "../../src/api/local/persist/wiring";
import { MemoryStorage } from "./memoryStorage";
import { recordText, sampleLog, START } from "./support";

let plan: RestorePlan;

beforeAll(async () => {
  const sample = await sampleLog();
  const planned = planRestore(recordText(sample.entries, sample.material.files), START);
  if (planned.kind !== "plan") throw new Error("fixture session does not restore");
  plan = planned.plan;
});

/** Just enough of a session's dependencies to see what the wiring changes. */
function baseDeps(overrides: Partial<SessionDeps> = {}): SessionDeps {
  return {
    store: new SessionLogStore(),
    random: () => seededRandom(1),
    newId: (prefix: string) => `${prefix}_fresh`,
    createOrchestrator: vi.fn(),
    clock: new FakeClock(),
    ...overrides,
  } as unknown as SessionDeps;
}

describe("FreezableClock", () => {
  it("follows the clock it wraps, stands still while frozen, and follows again after thaw", () => {
    const base = new FakeClock(START);
    const clock = new FreezableClock(base);
    expect(clock.now()).toEqual(START);
    clock.freeze(new Date("2026-01-01T00:00:00.000Z"));
    base.advance(60_000);
    expect(clock.now()).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    clock.thaw();
    expect(clock.now()).toEqual(base.now());
  });

  it("hands out copies: a caller that changes the date it got does not move the clock", () => {
    const clock = new FreezableClock(new FakeClock(START));
    clock.freeze(START);
    clock.now().setFullYear(1999);
    expect(clock.now()).toEqual(START);
  });
});

describe("persistWiring keys", () => {
  it("gives the stored keys to the first session and new keys to every later one", () => {
    const wiring = persistWiring({ plan, saver: new SessionSaver({ store: null, now: () => START }) });
    const first = wiring.keys();
    expect(first.engine.did).toBe(plan.keys.engine.did);
    expect(first.delegator.did).toBe(plan.keys.delegator.did);
    const second = wiring.keys();
    expect(second.engine.did).not.toBe(first.engine.did);
    expect(wiring.keys().engine.did).not.toBe(second.engine.did);
  });

  it("gives new keys to a page with nothing to restore", () => {
    const wiring = persistWiring({ plan: null, saver: new SessionSaver({ store: null, now: () => START }) });
    expect(wiring.keys().engine.did).not.toBe(plan.keys.engine.did);
  });
});

describe("persistWiring sessions", () => {
  it("a new session gets a saving store and nothing else changed", () => {
    const saver = new SessionSaver({ store: new MemoryStorage(), now: () => START });
    const wiring = persistWiring({ plan: null, saver });
    const deps = baseDeps();
    const keys = wiring.keys();
    const next = wiring.wrapSession(deps, keys);
    expect(next.store).toBeInstanceOf(SessionLogStore);
    expect(next.store).not.toBe(deps.store);
    expect(next.random).toBe(deps.random);
    expect(next.newId).toBe(deps.newId);
    expect(next.createOrchestrator).toBe(deps.createOrchestrator);
  });

  it("the resumed first session gets the stored mandate id once, then ids as before; other kinds of id are untouched", () => {
    const wiring = persistWiring({ plan, saver: new SessionSaver({ store: null, now: () => START }) });
    const next = wiring.wrapSession(baseDeps(), wiring.keys());
    expect(next.newId("crt")).toBe("crt_fresh");
    expect(next.newId("mnd")).toBe(plan.mandateId);
    expect(next.newId("mnd")).toBe("mnd_fresh");
    expect(next.newId("run")).toBe("run_fresh");
  });

  it("the resumed first session plays stored card ids back through a random source, and its store holds the stored log back", async () => {
    const wiring = persistWiring({ plan, saver: new SessionSaver({ store: null, now: () => START }) });
    const next = wiring.wrapSession(baseDeps(), wiring.keys());
    expect(next.random()).toBeInstanceOf(PlaybackRandom);
    expect(next.random()).toBe(next.random()); // one source for the rail of this session
    expect(await next.store.read(plan.head.log_id)).toEqual([]);
  });

  it("a later seal under the same keys is plain: the resume happens once, whatever order the dependencies are asked for", () => {
    const wiring = persistWiring({ plan, saver: new SessionSaver({ store: null, now: () => START }) });
    const real = { seal: vi.fn() };
    const base = baseDeps({ createOrchestrator: vi.fn(() => real) as never });
    const next = wiring.wrapSession(base, wiring.keys());
    const clock = new FakeClock(START);
    const asked = { clock, rail: {} } as never;

    const playback = next.random(); // openSession asks for the random source first, then builds the orchestrator
    const first = next.createOrchestrator(asked);
    expect(playback).toBeInstanceOf(PlaybackRandom);
    expect(first).not.toBe(real); // the resuming orchestrator
    expect(first.seal).not.toBe(real.seal);
    expect(base.createOrchestrator).toHaveBeenLastCalledWith(expect.objectContaining({ clock: expect.any(FreezableClock) }));

    const second = { clock: new FakeClock(START), rail: {} } as never;
    const randomAfter = next.random();
    const orchestratorAfter = next.createOrchestrator(second);
    expect(randomAfter).not.toBeInstanceOf(PlaybackRandom);
    expect(orchestratorAfter).toBe(real); // the real one, built from exactly what was asked
    expect(base.createOrchestrator).toHaveBeenLastCalledWith(second);
    expect(next.random()).not.toBeInstanceOf(PlaybackRandom);
  });

  it("the second session is not a resume", () => {
    const wiring = persistWiring({ plan, saver: new SessionSaver({ store: null, now: () => START }) });
    wiring.wrapSession(baseDeps(), wiring.keys());
    const deps = baseDeps();
    const later = wiring.wrapSession(deps, wiring.keys());
    expect(later.random).toBe(deps.random);
    expect(later.newId("mnd")).toBe("mnd_fresh");
  });

  it("a store of a session tells the saver what to write: that session's keys and its log as it is then", async () => {
    const storage = new MemoryStorage();
    const saver = new SessionSaver({ store: storage, now: () => START });
    const wiring = persistWiring({ plan: null, saver });
    const keys = wiring.keys();
    const next = wiring.wrapSession(baseDeps(), keys);
    await next.store.append(plan.entries[0] as never);
    saver.flush();
    const decoded = decodeRecord(storage.items.get(SESSION_KEY) ?? "");
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.record.keys.engine.did).toBe(keys.engine.did);
      expect(decoded.record.keys.delegator.did).toBe(keys.delegator.did);
      expect(decoded.record.log.split("\n")).toHaveLength(2); // the one entry and the final newline
    }
  });
});
