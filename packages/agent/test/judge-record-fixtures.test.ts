import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FIXTURES_DIR } from "@laisee/core/testing/fixtures";
import { recordFixtures } from "../src/judge/fit/record-fixtures";
import { variantById } from "../src/judge/fit/variants";
import { loadReplayRecordings } from "../src/judge/replay-recordings";
import { startMockSystemOne, type MockSystemOne } from "./support/mock-system-one";

let mock: MockSystemOne;
let dir: string;
beforeEach(async () => {
  mock = await startMockSystemOne();
  dir = mkdtempSync(join(tmpdir(), "record-"));
  for (const sub of ["listings", "carts", "mandate", "judge"]) cpSync(join(FIXTURES_DIR, sub), join(dir, sub), { recursive: true });
});
afterEach(async () => {
  await mock.close();
  rmSync(dir, { recursive: true, force: true });
});

const options = () => ({ baseUrl: mock.baseUrl, model: "typed-decisions", date: "2026-10-02", timeoutMs: 2000, fixturesDir: dir, variantId: "v0", questions: variantById("v0").questions, modelRevision: "55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851" });

describe("recordFixtures", () => {
  it("re-records every listing from the live judge into the replay envelope, labelled as recorded", async () => {
    const written = await recordFixtures(options());
    expect(written.map((w) => w.name).sort()).toEqual(["apparel-socks", "apparel-tee", "flagged-seller-hoodie", "injected-tee", "off-category-earbuds", "streetwear-jacket"]);
    const recordings = loadReplayRecordings(dir);
    expect(recordings).toHaveLength(6);
    for (const r of recordings) expect(r.record.version).toBe("recorded@55cf4c4e");
    const envelope = JSON.parse(readFileSync(join(dir, "judge/apparel-tee.json"), "utf8")) as { provenance: string; schema: string; note: string };
    expect(envelope.provenance).toBe("SIMULATED");
    expect(envelope.schema).toBe("judge-record");
    expect(envelope.note).toMatch(/Recorded from live Laya on 2026-10-02/);
    expect(envelope.note).toContain("55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851");
    expect(envelope.note).toContain("wording v0");
  });

  it("writes nothing when a call fails: a recording is always an OK answer", async () => {
    const before = readFileSync(join(dir, "judge/apparel-tee.json"), "utf8");
    mock.setBehavior({ kind: "http", status: 500 });
    await expect(recordFixtures(options())).rejects.toThrow(/apparel-socks: ERROR/);
    expect(readFileSync(join(dir, "judge/apparel-tee.json"), "utf8")).toBe(before);
  });
});
