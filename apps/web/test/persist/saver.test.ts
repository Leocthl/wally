// The saver: writes the session after the log changed (a short pause, so a burst of appends is one write), at once when
// the page goes away, never in the middle of a reset, and never leaves a stale record behind: a save that cannot be made
// removes what was stored, because a reload that restored an older state would quietly undo a purchase or a cancel.
import type { LogEntry } from "@wally/core/generated";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_KEY } from "../../src/api/local/persist/record";
import { planRestore } from "../../src/api/local/persist/plan";
import { SessionSaver, SAVE_DEBOUNCE_MS, type SaveSource } from "../../src/api/local/persist/saver";
import { MemoryStorage } from "./memoryStorage";
import { sampleLog, sealRequest, START } from "./support";

let entries: readonly LogEntry[] = [];
let source: SaveSource;
let familyEntries: readonly LogEntry[] = [];

beforeAll(async () => {
  const sample = await sampleLog(async (client, clock) => {
    await client.seal(sealRequest(clock, 300));
    await client.runScenario("small");
  });
  entries = sample.entries;
  source = { files: sample.material.files, entries: () => entries };
  const family = await sampleLog(async (client, clock) => {
    await client.seal({ ...sealRequest(clock, 500), family: { parent: "mum" } });
  }, sample.material);
  familyEntries = family.entries;
});

let storage: MemoryStorage;
let saver: SessionSaver;

beforeEach(() => {
  vi.useFakeTimers();
  storage = new MemoryStorage();
  saver = new SessionSaver({ store: storage, now: () => START });
});

afterEach(() => {
  saver.dispose();
  vi.useRealTimers();
});

const stored = (): string | undefined => storage.items.get(SESSION_KEY);

describe("when it writes", () => {
  it("waits a short while after a change, then writes once", () => {
    saver.changed(source);
    expect(stored()).toBeUndefined();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    expect(stored()).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(stored()).toBeDefined();
    expect(storage.writes).toBe(1);
  });

  it("a burst of changes is one write, of the state as it is when the pause ends", () => {
    let seen = 0;
    const live: SaveSource = { files: source.files, entries: () => ((seen += 1), entries.slice(0, seen === 1 ? 2 : entries.length)) };
    for (let i = 0; i < 5; i += 1) {
      saver.changed(live);
      vi.advanceTimersByTime(50);
    }
    expect(storage.writes).toBe(0);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(storage.writes).toBe(1);
    expect(seen).toBe(1); // the entries are read once, when the write is made, not at every change
  });

  it("writes a record the restore reads back as the same session", () => {
    saver.changed(source);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    const result = planRestore(stored() ?? "", START);
    expect(result.kind).toBe("plan");
    if (result.kind === "plan") expect(result.plan.entries).toEqual(entries);
  });

  it("flush writes at once and the pause that was running does not write again", () => {
    saver.changed(source);
    saver.flush();
    expect(storage.writes).toBe(1);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 3);
    expect(storage.writes).toBe(1);
  });

  it("flush with nothing changed writes nothing", () => {
    saver.flush();
    saver.changed(source);
    saver.flush();
    saver.flush();
    expect(storage.writes).toBe(1);
  });

  it("writes nothing for a log with no entries", () => {
    saver.changed({ files: source.files, entries: () => [] });
    saver.flush();
    expect(storage.writes).toBe(0);
  });
});

describe("when the page goes away", () => {
  function page(visibility: string): { window: EventTarget; document: EventTarget & { visibilityState: string } } {
    return { window: new EventTarget(), document: Object.assign(new EventTarget(), { visibilityState: visibility }) };
  }

  it("pagehide writes at once", () => {
    const events = page("visible");
    saver.listen(events);
    saver.changed(source);
    events.window.dispatchEvent(new Event("pagehide"));
    expect(storage.writes).toBe(1);
  });

  it("the page being hidden writes at once; being shown again does not", () => {
    const events = page("visible");
    saver.listen(events);
    saver.changed(source);
    events.document.dispatchEvent(new Event("visibilitychange"));
    expect(storage.writes).toBe(0);
    events.document.visibilityState = "hidden";
    events.document.dispatchEvent(new Event("visibilitychange"));
    expect(storage.writes).toBe(1);
  });

  it("stops listening when disposed", () => {
    const events = page("hidden");
    saver.listen(events);
    saver.dispose();
    saver.changed(source);
    events.window.dispatchEvent(new Event("pagehide"));
    events.document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    expect(storage.writes).toBe(0);
  });

  it("works with no page to listen to (a worker, a test)", () => {
    expect(() => saver.listen({ window: null, document: null })).not.toThrow();
  });
});

describe("a reset in progress", () => {
  it("changes made while suspended are not written, even at pagehide", () => {
    const events = { window: new EventTarget(), document: null };
    saver.listen(events);
    saver.suspend();
    saver.changed(source);
    events.window.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    expect(storage.writes).toBe(0);
  });

  it("resume(false) drops what was held back; the next change saves the session as it is then", () => {
    saver.suspend();
    saver.changed(source);
    saver.resume(false);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    expect(storage.writes).toBe(0);
    saver.changed(source);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(storage.writes).toBe(1);
  });

  it("resume(true) saves what was held back", () => {
    saver.suspend();
    saver.changed(source);
    saver.resume(true);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(storage.writes).toBe(1);
  });
});

describe("clear", () => {
  it("removes the stored session and cancels the write that was waiting", () => {
    saver.changed(source);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(stored()).toBeDefined();
    saver.changed(source);
    saver.clear();
    expect(stored()).toBeUndefined();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    expect(stored()).toBeUndefined();
    expect(storage.writes).toBe(1);
  });
});

describe("a save that cannot be made leaves nothing stale behind", () => {
  it("a full storage: the older record is removed, nothing throws, and the next change tries again", () => {
    saver.changed(source);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(stored()).toBeDefined();
    storage.fail = { set: true };
    saver.changed(source);
    expect(() => vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)).not.toThrow();
    expect(stored()).toBeUndefined();
    storage.fail = {};
    saver.changed(source);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(stored()).toBeDefined();
  });

  it("a session over the size cap: removed, not written, and not retried for the same state", () => {
    saver.changed(source);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    const big: SaveSource = { files: source.files, entries: () => Array.from({ length: 6000 }, () => structuredClone(entries.at(-1)) as LogEntry) };
    storage.writes = 0;
    saver.changed(big);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(stored()).toBeUndefined();
    expect(storage.writes).toBe(0);
  });

  it("a family budget: removed, not written (Mum's key is never kept)", () => {
    saver.changed(source);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(stored()).toBeDefined();
    saver.changed({ files: source.files, entries: () => familyEntries });
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(stored()).toBeUndefined();
  });

  it("an entries reader that throws: removed, nothing thrown", () => {
    saver.changed(source);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    saver.changed({
      files: source.files,
      entries: () => {
        throw new Error("boom");
      },
    });
    expect(() => vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)).not.toThrow();
    expect(stored()).toBeUndefined();
  });

  it("with no storage at all it does nothing and says nothing", () => {
    const none = new SessionSaver({ store: null, now: () => START });
    none.changed(source);
    expect(() => vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)).not.toThrow();
    none.clear();
    none.dispose();
  });
});
