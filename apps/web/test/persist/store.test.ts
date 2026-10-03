// SessionLogStore: the in-memory log store of a page, plus a synchronous mirror the saver can write from (a page that is
// closing cannot wait for a promise), a hook that says "something was appended", and a resume mode that holds a stored log
// back until the orchestrator has sealed it again byte for byte (see resume.ts).
import type { LogEntry } from "@wally/core/generated";
import { LogAppendError } from "@wally/core/testing";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SessionLogStore } from "../../src/api/local/persist/store";
import { sampleLog, sealRequest } from "./support";

let entries: readonly LogEntry[] = [];
let logId = "";

beforeAll(async () => {
  entries = (
    await sampleLog(async (client, clock) => {
      await client.seal(sealRequest(clock));
      await client.runScenario("normal");
      await client.runScenario("flagged");
    })
  ).entries;
  logId = entries[0]?.log_id ?? "";
});

describe("a plain store", () => {
  it("keeps what is appended, in order, and reads it back", async () => {
    const store = new SessionLogStore();
    for (const entry of entries) await store.append(entry);
    expect(await store.read(logId)).toEqual(entries);
    expect(await store.head(logId)).toEqual({ log_id: logId, seq: entries.length - 1, entry_hash: entries.at(-1)?.entry_hash });
    expect(await store.read("log_unknownLogId")).toEqual([]);
    expect(await store.head("log_unknownLogId")).toBeNull();
  });

  it("mirrors the log for a reader that cannot wait", async () => {
    const store = new SessionLogStore();
    expect(store.lastLogId).toBeNull();
    expect(store.entriesOf(logId)).toEqual([]);
    await store.append(entries[0] as LogEntry);
    expect(store.lastLogId).toBe(logId);
    expect(store.entriesOf(logId)).toEqual([entries[0]]);
  });

  it("says when an entry was appended, once per entry, after it is in", async () => {
    const seen: number[] = [];
    const store: SessionLogStore = new SessionLogStore({ onAppend: (id) => seen.push(store.entriesOf(id).length) });
    for (const entry of entries.slice(0, 3)) await store.append(entry);
    expect(seen).toEqual([1, 2, 3]);
  });

  it("refuses a wrong seq or an invalid entry, and says nothing about it", async () => {
    const onAppend = vi.fn();
    const store = new SessionLogStore({ onAppend });
    await store.append(entries[0] as LogEntry);
    onAppend.mockClear();
    await expect(store.append(entries[2] as LogEntry)).rejects.toBeInstanceOf(LogAppendError);
    await expect(store.append({ ...(entries[1] as LogEntry), signature: 5 } as unknown as LogEntry)).rejects.toBeInstanceOf(LogAppendError);
    expect(onAppend).not.toHaveBeenCalled();
    expect(store.entriesOf(logId)).toHaveLength(1);
  });

  it("does not let a hook that throws undo the append", async () => {
    const store = new SessionLogStore({
      onAppend: () => {
        throw new Error("saver broke");
      },
    });
    await expect(store.append(entries[0] as LogEntry)).resolves.toBeUndefined();
    expect(store.entriesOf(logId)).toHaveLength(1);
  });

  it("follows the newest log when a second budget is sealed under the same store", async () => {
    const store = new SessionLogStore();
    await store.append(entries[0] as LogEntry);
    const other = await sampleLog();
    await store.append(other.entries[0] as LogEntry);
    expect(store.lastLogId).toBe(other.entries[0]?.log_id);
    expect(store.entriesOf(logId)).toHaveLength(1);
  });
});

describe("a store resuming a stored log", () => {
  it("looks empty until the seal is made again, so the orchestrator seals it as new", async () => {
    const store = new SessionLogStore({ resume: entries });
    expect(await store.read(logId)).toEqual([]);
    expect(await store.head(logId)).toBeNull();
    expect(store.entriesOf(logId)).toEqual([]);
    expect(store.lastLogId).toBeNull();
  });

  it("takes the whole stored log in at once when seq 0 comes back identical", async () => {
    const onAppend = vi.fn();
    const store = new SessionLogStore({ resume: entries, onAppend });
    await store.append(structuredClone(entries[0]) as LogEntry);
    expect(await store.read(logId)).toEqual(entries);
    expect(store.entriesOf(logId)).toEqual(entries);
    expect(await store.head(logId)).toMatchObject({ seq: entries.length - 1 });
    expect(store.lastLogId).toBe(logId);
    expect(onAppend).not.toHaveBeenCalled(); // putting back what is already stored is not a change
  });

  it("goes on from there like any store", async () => {
    const onAppend = vi.fn();
    const store = new SessionLogStore({ resume: entries.slice(0, 3), onAppend });
    await store.append(structuredClone(entries[0]) as LogEntry);
    await store.append(entries[3] as LogEntry);
    expect(store.entriesOf(logId)).toHaveLength(4);
    expect(onAppend).toHaveBeenCalledTimes(1);
  });

  it("refuses a seq 0 that is not the stored one, and stays empty (fail closed)", async () => {
    const other = await sampleLog();
    const store = new SessionLogStore({ resume: entries });
    await expect(store.append(other.entries[0] as LogEntry)).rejects.toBeInstanceOf(LogAppendError);
    const changed = { ...(entries[0] as LogEntry), ts: "2026-10-03T02:00:00.001Z" } as LogEntry;
    await expect(store.append(changed)).rejects.toBeInstanceOf(LogAppendError);
    expect(await store.read(logId)).toEqual([]);
  });

  it("refuses any other entry while it waits for the seal", async () => {
    const store = new SessionLogStore({ resume: entries });
    await expect(store.append(entries[1] as LogEntry)).rejects.toBeInstanceOf(LogAppendError);
    expect(await store.read(logId)).toEqual([]);
  });

  it("refuses to resume from nothing", () => {
    expect(() => new SessionLogStore({ resume: [] })).toThrow(/resume/);
  });
});
