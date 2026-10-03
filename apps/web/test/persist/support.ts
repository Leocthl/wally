// Shared helpers for the persistence tests: an in-memory storage that can be made to fail the way a browser does
// (blocked, full, throwing), a fixed clock, and the real on-device client opened on that storage.
import { seededRandom } from "@wally/rail-sim";
import { FakeClock } from "@wally/core/testing";
import type { LogEntry } from "@wally/core/generated";
import { checkpointOf, toJsonl } from "@wally/core/log";
import { LocalApiClient } from "../../src/api/local/LocalApiClient";
import { newKeyMaterial, type KeyFiles, type KeyMaterial } from "../../src/api/local/persist/keys";
import { encodeRecord } from "../../src/api/local/persist/record";
import { MemoryStorage } from "./memoryStorage";
import { m0SealRequest } from "../../src/api/mock/presets";
import type { SealRequest } from "../../src/api/types";

export { MemoryStorage };

export const START = new Date("2026-10-03T02:00:00.000Z");

export function clockAt(start: Date = START): FakeClock {
  return new FakeClock(start);
}

/** A sealed-budget request for HK$ `hkd` with the ready-made rules, ending at the ready-made date. */
export function sealRequest(clock: { now(): Date }, hkd = 800): SealRequest {
  const base = m0SealRequest(clock.now());
  return { ...base, rules: { ...base.rules, budget: { amount_minor: hkd * 100, currency: "HKD" } } };
}

export type Run = (client: LocalApiClient, clock: FakeClock) => Promise<void>;

const sealAndBuy: Run = async (client, clock) => {
  await client.seal(sealRequest(clock));
  await client.runScenario("normal");
};

/** A real, signed log from the real stack (no persistence), with the keys that signed it and the clock that made it. */
export async function sampleLog(run: Run = sealAndBuy, material: KeyMaterial = newKeyMaterial()): Promise<{ readonly entries: readonly LogEntry[]; readonly clock: FakeClock; readonly material: KeyMaterial }> {
  const clock = clockAt();
  const client = new LocalApiClient({ clock, railRandom: () => seededRandom(7), tickMs: null, keys: () => material.keys });
  try {
    await run(client, clock);
    const exported = await client.exportLog();
    const entries = exported.log
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as LogEntry);
    return { entries, clock, material };
  } finally {
    client.dispose();
  }
}

/** The stored record's text for a log and the key files that signed it. */
export function recordText(entries: readonly LogEntry[], files: KeyFiles, savedAt: Date = START): string {
  const last = entries.at(-1) as LogEntry;
  const result = encodeRecord({ savedAt, keys: files, log: toJsonl(entries), head: checkpointOf(last) });
  if (!result.ok) throw new Error(`record: ${result.problem}`);
  return result.text;
}
