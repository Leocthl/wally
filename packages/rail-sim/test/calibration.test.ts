// T-R1 calibration against the one real decline [F40]. The real record lives in data/real-card-test.md; its
// machine-readable form is a decline table at data/real-card-decline.json (same format as the shipped default).
// No file means D-03 has not landed: the rail is tagged sim-only, the calibration checks are skipped, and the
// default table must say so. Dropping the file in turns the checks on with no code change.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DECLINE_TABLE, RailSim, seededRandom } from "../src";
import { loadDeclineTableFile } from "../src/node";
import { NOW, approvedDecision, pay } from "./helpers";

const REAL_DECLINE_FILE = fileURLToPath(new URL("../../../data/real-card-decline.json", import.meta.url));
const calibrationPresent = existsSync(REAL_DECLINE_FILE);

describe("T-R1 calibration status", () => {
  it.skipIf(calibrationPresent)("sim-only: no real decline captured yet, so the rail says SIMULATED and never claims calibration", () => {
    expect(DEFAULT_DECLINE_TABLE.calibrated).toBe(false);
    expect(DEFAULT_DECLINE_TABLE.label).toContain("SIMULATED");
    expect(DEFAULT_DECLINE_TABLE.entries.OVER_LIMIT.provenance).toBe("SIMULATED");
  });

  describe.skipIf(!calibrationPresent)("calibrated from data/real-card-decline.json", () => {
    it("the file is a valid table with OVER_LIMIT observed", () => {
      const table = loadDeclineTableFile(REAL_DECLINE_FILE);
      expect(table.calibrated).toBe(true);
      expect(table.entries.OVER_LIMIT.provenance).toMatch(/^OBSERVED\(/);
    });

    it("the rail returns the same decline class and the same timing shape as the record", async () => {
      const table = loadDeclineTableFile(REAL_DECLINE_FILE);
      const sleep = vi.fn(async (_ms: number) => {});
      const rail = new RailSim({ random: seededRandom(1), declineTable: table, sleep });
      const decision = approvedDecision({ totalMinor: 10_000 });
      const card = await rail.mint({ decision, ttlMs: 60_000, now: NOW });
      const event = await pay(rail, card, 10_001);
      expect(event).toMatchObject({ event: "DECLINED", decline_code: "OVER_LIMIT" });
      const entry = table.entries.OVER_LIMIT;
      expect(rail.declineInfo("OVER_LIMIT")).toMatchObject({ wording: entry.wording, timing: entry.timing });
      expect(sleep).toHaveBeenCalledTimes(entry.timing === "deferred" ? 1 : 0);
      expect(rail.card(card.id)?.state).toBe("ACTIVE");
    });
  });
});
