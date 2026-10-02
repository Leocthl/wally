// A-18: FileLogStore, append-only JSONL under LOG_DIR with fsync on append, private modes, one write queue
// per file across stores. Temp dirs only.
import { appendFile, chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { jcs } from "../src/crypto";
import { appendEntry, toJsonlLine } from "../src/log";
import { FileLogStore } from "../src/log/file";
import { buildDemoLog, demoKeys, demoSteps, LOG_ID } from "./log-helpers";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "laisee-log-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("FileLogStore", () => {
  it("appends canonical JSONL lines and reads them back", async () => {
    const { entries } = await buildDemoLog();
    const store = new FileLogStore(join(dir, "logs"));
    expect(await store.read(LOG_ID)).toEqual([]);
    expect(await store.head(LOG_ID)).toBeNull();
    for (const entry of entries) await store.append(entry);
    const text = await readFile(join(dir, "logs", `${LOG_ID}.jsonl`), "utf8");
    expect(text).toBe(entries.map((e) => `${jcs(e)}\n`).join(""));
    expect(text.split("\n")[0]).toBe(toJsonlLine(entries[0]!));
    expect(await store.read(LOG_ID)).toEqual(entries);
    const last = entries.at(-1)!;
    expect(await store.head(LOG_ID)).toEqual({ log_id: LOG_ID, seq: last.seq, entry_hash: last.entry_hash });
  });

  it("works as the LogStore behind appendEntry", async () => {
    const keys = demoKeys();
    const store = new FileLogStore(dir);
    for (const step of demoSteps(keys).slice(0, 3)) {
      await appendEntry(store, keys.engine, LOG_ID, step.kind, step.payload, new Date("2026-10-03T02:00:01Z"));
    }
    expect((await store.read(LOG_ID)).map((e) => e.seq)).toEqual([0, 1, 2]);
  });

  it("rejects a wrong seq, a broken prev_hash, an invalid entry and a path-like log id", async () => {
    const { entries } = await buildDemoLog();
    const store = new FileLogStore(dir);
    await expect(store.append(entries[1]!)).rejects.toMatchObject({ code: "SEQ" });
    await store.append(entries[0]!);
    await expect(store.append(entries[0]!)).rejects.toMatchObject({ code: "SEQ" });
    await expect(store.append(entries[2]!)).rejects.toMatchObject({ code: "SEQ" });
    await expect(store.append({ ...entries[1]!, prev_hash: "f".repeat(64) })).rejects.toMatchObject({ code: "PREV_HASH" });
    await expect(store.append({ ...entries[1]!, payload: { nope: true } } as never)).rejects.toMatchObject({ code: "SCHEMA" });
    await expect(store.read("../../etc/passwd")).rejects.toMatchObject({ code: "LOG_ID" });
    expect(await store.read(LOG_ID)).toHaveLength(1);
  });

  it.skipIf(process.platform === "win32")("creates the directory 0700 and each log file 0600, and tightens wider ones", async () => {
    const { entries } = await buildDemoLog();
    const logs = join(dir, "logs");
    const store = new FileLogStore(logs);
    await store.append(entries[0]!);
    const file = join(logs, `${LOG_ID}.jsonl`);
    expect((await stat(logs)).mode & 0o777).toBe(0o700);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await chmod(logs, 0o755);
    await chmod(file, 0o644);
    await store.append(entries[1]!);
    expect((await stat(logs)).mode & 0o777).toBe(0o700);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("serialises appends across two stores on the same directory: exactly one same-seq writer wins", async () => {
    const { entries } = await buildDemoLog();
    const a = new FileLogStore(dir);
    const b = new FileLogStore(join(dir, ".", "")); // same directory, spelled differently
    await a.append(entries[0]!);
    const results = await Promise.allSettled([a.append(entries[1]!), b.append(entries[1]!), b.append(entries[1]!)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected", "rejected"]);
    expect(await a.read(LOG_ID)).toHaveLength(2);
    const text = await readFile(join(dir, `${LOG_ID}.jsonl`), "utf8");
    expect(text.split("\n").filter((l) => l !== "")).toHaveLength(2);
  });

  it("serialises concurrent appends: exactly one of two same-seq writers wins", async () => {
    const { entries } = await buildDemoLog();
    const store = new FileLogStore(dir);
    await store.append(entries[0]!);
    const results = await Promise.allSettled([store.append(entries[1]!), store.append(entries[1]!)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await store.read(LOG_ID)).toHaveLength(2);
  });

  it("fails closed on a corrupt or partially written file", async () => {
    const { entries } = await buildDemoLog();
    const path = join(dir, `${LOG_ID}.jsonl`);
    await writeFile(path, `${jcs(entries[0])}\n{"v":1,`);
    const store = new FileLogStore(dir);
    await expect(store.read(LOG_ID)).rejects.toMatchObject({ code: "CORRUPT" });
    await expect(store.append(entries[1]!)).rejects.toMatchObject({ code: "CORRUPT" });
    await writeFile(path, `${jcs(entries[1])}\n`);
    await expect(store.read(LOG_ID)).rejects.toMatchObject({ code: "CORRUPT" });
    await writeFile(path, `${jcs(entries[0])}\n`);
    await appendFile(path, "not json\n");
    await expect(store.head(LOG_ID)).rejects.toMatchObject({ code: "CORRUPT" });
  });
});
