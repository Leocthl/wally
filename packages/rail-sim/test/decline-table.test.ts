// A-21 calibration hook: a data-driven decline table (code, wording, immediate or deferred timing)
// so the one real observed decline [F40] drops in with no code change. The shipped default is SIMULATED.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  DECLINE_CODES,
  DEFAULT_DECLINE_TABLE,
  DeclineTableError,
  RailSim,
  parseDeclineTable,
  seededRandom,
} from "../src";
import { DEFAULT_DECLINE_TABLE_PATH, loadDeclineTableFile } from "../src/node";
import { MERCHANT, NOW, approvedDecision, mintCard, pay } from "./helpers";

const sandbox = mkdtempSync(join(tmpdir(), "laisee-decline-"));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

const defaultJson = (): Record<string, unknown> => JSON.parse(readFileSync(DEFAULT_DECLINE_TABLE_PATH, "utf8")) as Record<string, unknown>;

/** TEST SAMPLE only: stands in for a table filled from data/real-card-test.md. Not an observation. */
function calibratedSample(): Record<string, unknown> {
  const base = defaultJson();
  const declines = base["declines"] as Record<string, unknown>;
  return {
    ...base,
    label: "TEST SAMPLE standing in for an observed decline",
    declines: {
      ...declines,
      OVER_LIMIT: {
        wording: "Sample bank wording for an over-limit payment (test sample)",
        timing: "deferred",
        delay_ms: 4_200,
        shows_at: "both",
        hold: "shown",
        provenance: "OBSERVED(2026-10-03)",
      },
    },
  };
}

describe("the shipped default table is clearly SIMULATED", () => {
  it("covers every decline code, immediate, uncalibrated, wording says SIMULATED", () => {
    expect(Object.keys(DEFAULT_DECLINE_TABLE.entries).sort()).toEqual([...DECLINE_CODES].sort());
    expect(DEFAULT_DECLINE_TABLE.calibrated).toBe(false);
    expect(DEFAULT_DECLINE_TABLE.label).toContain("SIMULATED");
    for (const code of DECLINE_CODES) {
      const entry = DEFAULT_DECLINE_TABLE.entries[code];
      expect(entry.provenance).toBe("SIMULATED");
      expect(entry.timing).toBe("immediate");
      expect(entry.wording).toContain("SIMULATED");
    }
  });

  it("the file on disk and the bundled default parse to the same table", () => {
    expect(loadDeclineTableFile(DEFAULT_DECLINE_TABLE_PATH)).toEqual(DEFAULT_DECLINE_TABLE);
    expect(Object.isFrozen(DEFAULT_DECLINE_TABLE)).toBe(true);
  });

  it("the rail exposes the wording and timing for each code it can emit", async () => {
    const { rail } = await mintCard();
    for (const code of DECLINE_CODES) {
      expect(rail.declineInfo(code)).toMatchObject({ code, timing: "immediate", provenance: "SIMULATED", simulated: true });
    }
  });
});

describe("parseDeclineTable validates the calibration file (fail closed)", () => {
  const bad: [string, (j: Record<string, unknown>) => unknown][] = [
    ["not an object", () => "nope"],
    ["null", () => null],
    ["wrong version", (j) => ({ ...j, version: 2 })],
    ["missing label", ({ label: _l, ...rest }) => rest],
    ["unknown top-level key", (j) => ({ ...j, extra: 1 })],
    ["no declines", ({ declines: _d, ...rest }) => rest],
    ["a code is missing", (j) => ({ ...j, declines: Object.fromEntries(Object.entries(j["declines"] as object).filter(([k]) => k !== "CARD_USED")) })],
    ["an unknown code", (j) => ({ ...j, declines: { ...(j["declines"] as object), INSUFFICIENT_FUNDS: { wording: "x", timing: "immediate", shows_at: "app", hold: "none", provenance: "SIMULATED" } } })],
    ["empty wording", (j) => withEntry(j, "OVER_LIMIT", { wording: "" })],
    ["wording too long", (j) => withEntry(j, "OVER_LIMIT", { wording: "w".repeat(201) })],
    ["wording with a PAN-like digit run (I8)", (j) => withEntry(j, "OVER_LIMIT", { wording: "Card 4111 1111 1111 1111 declined" })],
    ["bad timing", (j) => withEntry(j, "OVER_LIMIT", { timing: "later" })],
    ["deferred without a delay", (j) => withEntry(j, "OVER_LIMIT", { timing: "deferred" })],
    ["immediate with a delay", (j) => withEntry(j, "OVER_LIMIT", { delay_ms: 10 })],
    ["fractional delay", (j) => withEntry(j, "OVER_LIMIT", { timing: "deferred", delay_ms: 1.5 })],
    ["zero delay", (j) => withEntry(j, "OVER_LIMIT", { timing: "deferred", delay_ms: 0 })],
    ["bad shows_at", (j) => withEntry(j, "OVER_LIMIT", { shows_at: "email" })],
    ["bad hold", (j) => withEntry(j, "OVER_LIMIT", { hold: "maybe" })],
    ["bad provenance", (j) => withEntry(j, "OVER_LIMIT", { provenance: "MEASURED(30)" })],
    ["observed without a date", (j) => withEntry(j, "OVER_LIMIT", { provenance: "OBSERVED" })],
    ["unknown entry key", (j) => withEntry(j, "OVER_LIMIT", { pan: "x" })],
  ];

  function withEntry(j: Record<string, unknown>, code: string, patch: Record<string, unknown>): unknown {
    const declines = j["declines"] as Record<string, Record<string, unknown>>;
    return { ...j, declines: { ...declines, [code]: { ...declines[code], ...patch } } };
  }

  it.each(bad)("rejects %s", (_name, mutate) => {
    expect(() => parseDeclineTable(mutate(defaultJson()))).toThrow(DeclineTableError);
  });

  it("accepts a calibrated entry and marks the table calibrated only when OVER_LIMIT is OBSERVED", () => {
    const table = parseDeclineTable(calibratedSample());
    expect(table.calibrated).toBe(true);
    expect(table.entries.OVER_LIMIT).toMatchObject({ timing: "deferred", delay_ms: 4_200, shows_at: "both", hold: "shown" });
    expect(table.entries.CARD_USED.provenance).toBe("SIMULATED");
    const onlyOther = withEntry(defaultJson(), "CARD_USED", { provenance: "OBSERVED(2026-10-03)" });
    expect(parseDeclineTable(onlyOther).calibrated).toBe(false);
  });
});

describe("loadDeclineTableFile", () => {
  it("loads a calibrated file dropped in with no code change", () => {
    const file = join(sandbox, "calibrated.json");
    writeFileSync(file, JSON.stringify(calibratedSample()));
    expect(loadDeclineTableFile(file).entries.OVER_LIMIT.wording).toContain("Sample bank wording");
  });

  it("names the file in its error for a missing file, bad JSON or a bad table", () => {
    const badJson = join(sandbox, "bad.json");
    const badTable = join(sandbox, "bad-table.json");
    writeFileSync(badJson, "{ not json");
    writeFileSync(badTable, JSON.stringify({ version: 1 }));
    for (const file of [join(sandbox, "missing.json"), badJson, badTable]) {
      expect(() => loadDeclineTableFile(file)).toThrow(file);
    }
  });
});

describe("T-R1 calibration: wording and timing follow the table, the decline class does not change", () => {
  it("a deferred OVER_LIMIT waits the observed delay; immediate codes and approvals do not", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const table = parseDeclineTable(calibratedSample());
    const rail = new RailSim({ random: seededRandom(1), declineTable: table, sleep });
    const card = await rail.mint({ decision: approvedDecision({ totalMinor: 25_900 }), ttlMs: 60_000, now: NOW });

    const over = await pay(rail, card, 25_901);
    expect(over).toMatchObject({ event: "DECLINED", decline_code: "OVER_LIMIT", at: NOW.toISOString() });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenLastCalledWith(4_200);
    expect(rail.declineInfo("OVER_LIMIT")).toMatchObject({
      wording: expect.stringContaining("Sample bank wording"),
      timing: "deferred",
      delay_ms: 4_200,
      provenance: "OBSERVED(2026-10-03)",
      simulated: true,
    });

    expect(await pay(rail, card, 25_900, { domain: MERCHANT })).toMatchObject({ event: "AUTHORISED" });
    expect(await pay(rail, card, 25_900)).toMatchObject({ decline_code: "CARD_USED" });
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("an idempotent replay of a deferred decline does not wait again", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const rail = new RailSim({ random: seededRandom(1), declineTable: parseDeclineTable(calibratedSample()), sleep });
    const card = await rail.mint({ decision: approvedDecision({ totalMinor: 1_000 }), ttlMs: 60_000, now: NOW });
    await pay(rail, card, 1_001, { key: "same" });
    await pay(rail, card, 1_001, { key: "same" });
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("without an injected sleep a deferred decline returns at once (tests and replays stay fast)", async () => {
    const rail = new RailSim({ random: seededRandom(1), declineTable: parseDeclineTable(calibratedSample()) });
    const card = await rail.mint({ decision: approvedDecision({ totalMinor: 1_000 }), ttlMs: 60_000, now: NOW });
    expect(await pay(rail, card, 1_001)).toMatchObject({ decline_code: "OVER_LIMIT" });
  });
});
