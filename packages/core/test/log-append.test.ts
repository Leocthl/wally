// A-18 / T-I7: appendEntry builds the entry, hashes and engine signature exactly as
// log-entry.schema.json documents, cross-checked by the independent path, and fails closed.
import { describe, expect, it } from "vitest";
import { createSigner } from "../src/crypto";
import {
  appendEntry,
  buildEntry,
  checkpointOf,
  GENESIS_PREV_HASH,
  headCheckpoint,
  LogError,
  logIdForMandate,
  parseCheckpoint,
} from "../src/log";
import type { LogStore } from "../src/ports";
import { validateLogEntry } from "../src/schema";
import { MemoryLogStore } from "../src/testing";
import { indepEntryHashes } from "./crypto-independent";
import { buildDemoLog, demoCredential, demoKeys, demoSteps, ENGINE_SEED, LOG_ID, MANDATE_ID } from "./log-helpers";

const NOW = new Date("2026-10-03T02:00:01Z");

describe("appendEntry", () => {
  it("writes one schema-valid signed entry per call with a linked chain", async () => {
    const { entries } = await buildDemoLog();
    expect(entries.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(entries[0]?.prev_hash).toBe(GENESIS_PREV_HASH);
    for (const [i, entry] of entries.entries()) {
      expect(validateLogEntry(entry).ok).toBe(true);
      if (i > 0) expect(entry.prev_hash).toBe(entries[i - 1]?.entry_hash);
    }
  });

  it("computes payload_hash, entry_hash and signature as the independent path does", async () => {
    const { entries } = await buildDemoLog();
    for (const entry of entries) {
      const indep = indepEntryHashes(entry as unknown as Record<string, unknown>, ENGINE_SEED);
      expect([entry.payload_hash, entry.entry_hash, entry.signature]).toEqual([indep.payloadHash, indep.entryHash, indep.signature]);
    }
  });

  it("signs as the engine did:key and stamps ts from `now`", async () => {
    const keys = demoKeys();
    const store = new MemoryLogStore();
    const entry = await appendEntry(store, keys.engine, LOG_ID, "MANDATE_SEALED", demoCredential(keys), NOW);
    expect(entry.signer).toBe(keys.engine.did);
    expect(entry.ts).toBe("2026-10-03T02:00:01.000Z");
    expect(await store.head(LOG_ID)).toEqual(checkpointOf(entry));
  });

  it("copies the payload: later changes by the caller do not reach the logged entry", async () => {
    const keys = demoKeys();
    const store = new MemoryLogStore();
    const credential = demoCredential(keys);
    const entry = await appendEntry(store, keys.engine, LOG_ID, "MANDATE_SEALED", credential, NOW);
    expect(entry.payload).not.toBe(credential);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.payload)).toBe(true);
  });

  it("rejects a first entry that is not MANDATE_SEALED and a second MANDATE_SEALED", async () => {
    const keys = demoKeys();
    const [seal, decision] = demoSteps(keys);
    const store = new MemoryLogStore();
    await expect(appendEntry(store, keys.engine, LOG_ID, "DECISION", decision!.payload as never, NOW)).rejects.toMatchObject({
      code: "KIND",
    });
    await appendEntry(store, keys.engine, LOG_ID, "MANDATE_SEALED", seal!.payload as never, NOW);
    await expect(appendEntry(store, keys.engine, LOG_ID, "MANDATE_SEALED", seal!.payload as never, NOW)).rejects.toMatchObject({
      code: "KIND",
    });
  });

  it("binds the log to the sealed mandate: log_<id> for mnd_<id>", async () => {
    const keys = demoKeys();
    expect(logIdForMandate(MANDATE_ID)).toBe(LOG_ID);
    expect(() => logIdForMandate("demoM0")).toThrow(LogError);
    const store = new MemoryLogStore();
    await expect(appendEntry(store, keys.engine, "log_otherLog1", "MANDATE_SEALED", demoCredential(keys), NOW)).rejects.toMatchObject({
      code: "LOG_ID",
    });
  });

  it("fails closed on a schema-invalid payload, a bad log id or an invalid clock", async () => {
    const keys = demoKeys();
    const store = new MemoryLogStore();
    const bad = { ...demoCredential(keys), extra: true };
    await expect(appendEntry(store, keys.engine, LOG_ID, "MANDATE_SEALED", bad as never, NOW)).rejects.toMatchObject({ code: "SCHEMA" });
    await expect(appendEntry(store, keys.engine, "../etc", "MANDATE_SEALED", demoCredential(keys), NOW)).rejects.toBeInstanceOf(LogError);
    await expect(
      appendEntry(store, keys.engine, LOG_ID, "MANDATE_SEALED", demoCredential(keys), new Date(Number.NaN)),
    ).rejects.toMatchObject({ code: "CLOCK" });
    expect(await store.read(LOG_ID)).toEqual([]);
  });

  it("propagates a store failure and leaves nothing half-written", async () => {
    const keys = demoKeys();
    const failing: LogStore = {
      read: async () => [],
      head: async () => null,
      append: async () => {
        throw new Error("disk full (simulated)");
      },
    };
    await expect(appendEntry(failing, keys.engine, LOG_ID, "MANDATE_SEALED", demoCredential(keys), NOW)).rejects.toThrow("disk full");
  });

  it("refuses a head from another log", () => {
    const keys = demoKeys();
    const head = { log_id: "log_otherLog1", seq: 0, entry_hash: "a".repeat(64) };
    expect(() =>
      buildEntry({ head, signer: keys.engine, logId: LOG_ID, kind: "PACKET_EXPIRED", payload: { mandate_id: MANDATE_ID, expired_at: "2026-10-31T15:59:59Z" }, now: NOW }),
    ).toThrow(LogError);
  });
});

describe("head checkpoint", () => {
  it("returns the store head as a fresh checkpoint, or null for an empty log", async () => {
    const { store, checkpoint } = await buildDemoLog();
    expect(await headCheckpoint(store, LOG_ID)).toEqual(checkpoint);
    expect(await headCheckpoint(new MemoryLogStore(), LOG_ID)).toBeNull();
  });

  it("parses a checkpoint strictly", () => {
    const good = { log_id: LOG_ID, seq: 3, entry_hash: "a".repeat(64) };
    expect(parseCheckpoint(good)).toEqual({ ok: true, value: good });
    const bad: unknown[] = [
      null,
      [],
      { ...good, seq: -1 },
      { ...good, seq: 1.5 },
      { ...good, entry_hash: "A".repeat(64) },
      { ...good, log_id: "mnd_demoM0" },
      { ...good, extra: 1 },
      { log_id: LOG_ID, seq: 3 },
    ];
    for (const value of bad) expect(parseCheckpoint(value).ok).toBe(false);
  });

  it("fails closed when a store reports a malformed head", async () => {
    const store: LogStore = { read: async () => [], head: async () => ({ log_id: LOG_ID, seq: -2, entry_hash: "x" }), append: async () => {} };
    await expect(headCheckpoint(store, LOG_ID)).rejects.toBeInstanceOf(LogError);
    const signer = createSigner(ENGINE_SEED);
    await expect(appendEntry(store, signer, LOG_ID, "PACKET_EXPIRED", { mandate_id: MANDATE_ID, expired_at: "2026-10-31T15:59:59Z" }, NOW)).rejects.toBeInstanceOf(LogError);
  });
});
