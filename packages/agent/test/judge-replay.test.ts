import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateJudgeRecord } from "@wally/core/schema";
import { FIXTURES_DIR, listFixtureFiles, loadFixture } from "@wally/core/testing/fixtures";
import { sha256Hex } from "../src/judge/fit/inputs";
import { loadReplayRecordings } from "../src/judge/replay-recordings";
import { ReplayJudge } from "../src/judge/replay-judge";
import { DEMO_LISTINGS, demoInput, demoListing, inputWithText } from "./support/inputs";

const recordings = loadReplayRecordings();
const judge = new ReplayJudge({ recordings });

describe("loadReplayRecordings", () => {
  it("keys every data/fixtures/judge record by the SHA-256 of its listing text", () => {
    const judgeFiles = listFixtureFiles().filter((f) => f.startsWith("judge/"));
    expect(recordings).toHaveLength(judgeFiles.length);
    for (const name of DEMO_LISTINGS) {
      const hit = recordings.find((r) => r.fingerprint === sha256Hex(demoListing(name).text));
      expect(hit?.source, name).toBe(`judge/${name}.json`);
    }
  });

  it("only accepts OK records with answers, labelled as recorded", () => {
    for (const r of recordings) {
      expect(r.record.status).toBe("OK");
      expect(r.record.answers).toBeDefined();
      expect(r.record.provider).toBe("replay");
      expect(r.record.version.startsWith("recorded@")).toBe(true);
    }
  });

  it("rejects a judge record that has no listing to fingerprint, and an empty directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "replay-"));
    try {
      expect(() => loadReplayRecordings(dir)).toThrow(/no judge recordings/);
      mkdirSync(join(dir, "judge"));
      copyFileSync(join(FIXTURES_DIR, "judge/apparel-tee.json"), join(dir, "judge/orphan.json"));
      expect(() => loadReplayRecordings(dir)).toThrow(/orphan/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("ReplayJudge", () => {
  it("is provider replay and clearly labelled", () => {
    expect(judge.provider).toBe("replay");
  });

  it.each(DEMO_LISTINGS)("returns the recorded answers for %s with status OK", async (name) => {
    const record = await judge.assess(demoInput(name), { timeoutMs: 1000 });
    const recorded = loadFixture(`judge/${name}.json`, "judge-record");
    expect(record.status).toBe("OK");
    expect(record.provider).toBe("replay");
    expect(record.answers).toEqual(recorded.answers);
    expect(record.model).toBe(recorded.model);
    expect(record.version).toBe(recorded.version);
    expect(record.shadow).toBe(false);
    expect(validateJudgeRecord(record).ok).toBe(true);
  });

  it("reports the time the lookup took, not the recorded latency (replay is not a measurement)", async () => {
    const recorded = loadFixture("judge/injected-tee.json", "judge-record");
    const record = await judge.assess(demoInput("injected-tee"), { timeoutMs: 1000 });
    expect(record.latency_ms).toBeLessThan(recorded.latency_ms);
  });

  it("gives the S3 fixture an injection score over T_inj and the S2 fixture a seller score over the deny threshold", async () => {
    const s3 = (await judge.assess(demoInput("injected-tee"), { timeoutMs: 1000 })).answers;
    const s2 = (await judge.assess(demoInput("flagged-seller-hoodie"), { timeoutMs: 1000 })).answers;
    expect(1 - (s3?.injection_risk.clean ?? 1)).toBeGreaterThanOrEqual(0.63); // T_inj [F36]
    expect(s2?.seller_risk.high_risk).toBeGreaterThanOrEqual(0.55); // T_sell_deny [F36]
  });

  it("fails closed for a listing it has no recording for (ERROR, no answers)", async () => {
    const record = await judge.assess(inputWithText("A listing the booth visitor just typed in."), { timeoutMs: 1000 });
    expect(record.status).toBe("ERROR");
    expect(record.answers).toBeUndefined();
    expect(record.provider).toBe("replay");
    expect(validateJudgeRecord(record).ok).toBe(true);
  });

  it("does not answer for text that differs by one character", async () => {
    const text = demoListing("apparel-tee").text;
    expect((await judge.assess(inputWithText(`${text}.`), { timeoutMs: 1000 })).status).toBe("ERROR");
  });

  it("returns TIMEOUT for an aborted signal or an unusable timeout, without answers", async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await judge.assess(demoInput("apparel-tee"), { timeoutMs: 1000, signal: controller.signal })).status).toBe("TIMEOUT");
    expect((await judge.assess(demoInput("apparel-tee"), { timeoutMs: 0 })).status).toBe("TIMEOUT");
  });

  it("does not alias the stored recording (callers cannot corrupt later answers)", async () => {
    const first = await judge.assess(demoInput("apparel-tee"), { timeoutMs: 1000 });
    const answers = first.answers as { scope_fit: { in_scope: number } } | undefined;
    if (answers !== undefined) {
      try {
        answers.scope_fit.in_scope = 0;
      } catch {
        // frozen copies are fine too
      }
    }
    const second = await judge.assess(demoInput("apparel-tee"), { timeoutMs: 1000 });
    expect(second.answers?.scope_fit.in_scope).toBeGreaterThan(0);
  });
});
