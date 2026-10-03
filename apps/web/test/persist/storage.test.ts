// The browser's storage seen through try/catch: a page that cannot read or write (private mode, blocked site data, a full
// disk, a getter that throws) works as it always did. Nothing here ever throws.
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserStore, readStored, removeStored, storageWorks, writeStored } from "../../src/api/local/persist/storage";
import { MemoryStorage } from "./memoryStorage";

afterEach(() => vi.unstubAllGlobals());

describe("readStored", () => {
  it("returns the text, or null when there is none", () => {
    const store = new MemoryStorage();
    expect(readStored(store, "k")).toEqual({ ok: true, text: null });
    store.setItem("k", "v");
    expect(readStored(store, "k")).toEqual({ ok: true, text: "v" });
  });

  it("says the storage is unusable when it throws or there is none", () => {
    const store = new MemoryStorage();
    store.fail = { get: true };
    expect(readStored(store, "k")).toEqual({ ok: false });
    expect(readStored(null, "k")).toEqual({ ok: false });
  });
});

describe("writeStored and removeStored", () => {
  it("report whether the browser took the call", () => {
    const store = new MemoryStorage();
    expect(writeStored(store, "k", "v")).toBe(true);
    expect(store.items.get("k")).toBe("v");
    expect(removeStored(store, "k")).toBe(true);
    expect(store.items.has("k")).toBe(false);
  });

  it("do not throw when the storage is full, blocked or missing", () => {
    const store = new MemoryStorage();
    store.fail = { set: true, remove: true };
    expect(writeStored(store, "k", "v")).toBe(false);
    expect(removeStored(store, "k")).toBe(false);
    expect(writeStored(null, "k", "v")).toBe(false);
    expect(removeStored(null, "k")).toBe(false);
  });
});

describe("storageWorks", () => {
  it("is true when a small value can be written and taken back, and leaves nothing behind", () => {
    const store = new MemoryStorage();
    expect(storageWorks(store)).toBe(true);
    expect(store.items.size).toBe(0);
  });

  it("is false for a storage that throws on any call, and for none", () => {
    for (const fail of [{ get: true }, { set: true }, { remove: true }] as const) {
      const store = new MemoryStorage();
      store.fail = fail;
      expect(storageWorks(store), JSON.stringify(fail)).toBe(false);
    }
    expect(storageWorks(null)).toBe(false);
  });
});

describe("browserStore", () => {
  it("is the page's localStorage", () => {
    expect(browserStore()).toBe(window.localStorage);
  });

  it("is null when the browser denies the storage object itself (a getter that throws)", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new DOMException("denied", "SecurityError");
      },
    });
    expect(browserStore()).toBeNull();
  });

  it("is null where there is no window (a node test, a worker)", () => {
    vi.stubGlobal("window", undefined);
    expect(browserStore()).toBeNull();
  });
});
