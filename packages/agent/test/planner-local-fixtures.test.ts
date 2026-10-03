// The new local-planner evaluation scenarios as fixtures (data/fixtures/planner/qwen/*.json): SIMULATED requests
// in English, Traditional Chinese and Cantonese with the author's EXPECTED answer, stored as planner-replay
// envelopes. The replay backend reads only the top level of data/fixtures/planner, so these never change what
// the booth replays. Regenerate with UPDATE_QWEN_FIXTURES=1.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES_DIR, loadFixture } from "@wally/core/testing/fixtures";
import { loadReplayRecords } from "../src/planner/replay-planner";
import { FIXTURED_SCENARIOS, QWEN_SCENARIOS, expectedFixtureText, expectedRecord } from "./support/qwen/scenarios";

const DIR = join(FIXTURES_DIR, "planner", "qwen");
const file = (id: string) => `planner/qwen/${id}.json`;

describe.runIf(process.env["UPDATE_QWEN_FIXTURES"] === "1")("regenerating the qwen scenario fixtures", () => {
  it("writes data/fixtures/planner/qwen", () => {
    mkdirSync(DIR, { recursive: true });
    for (const s of FIXTURED_SCENARIOS) writeFileSync(join(FIXTURES_DIR, file(s.id)), expectedFixtureText(s));
  });
});

describe("qwen scenario set", () => {
  it("adds at least 12 SIMULATED requests across English, Traditional Chinese and Cantonese and the required kinds", () => {
    expect(QWEN_SCENARIOS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(QWEN_SCENARIOS.map((s) => s.id)).size).toBe(QWEN_SCENARIOS.length);
    expect(new Set(QWEN_SCENARIOS.map((s) => s.language))).toEqual(new Set(["en", "zh-Hant", "yue"]));
    expect(QWEN_SCENARIOS.map((s) => s.kind)).toEqual(expect.arrayContaining(["typo", "vague", "two-item ambiguity", "over-budget wording", "quantity"]));
  });

  it("writes at least 12 of them as fixture files (the two variant proposals use in-memory listings and stay in code)", () => {
    expect(FIXTURED_SCENARIOS.length).toBeGreaterThanOrEqual(12);
  });

  it.each(FIXTURED_SCENARIOS)("$id has a valid fixture with the expected answer", (s) => {
    const record = loadFixture(file(s.id), "planner-replay");
    expect(record).toEqual(expectedRecord(s));
    expect(readFileSync(join(FIXTURES_DIR, file(s.id)), "utf8")).toBe(expectedFixtureText(s));
  });

  it("never reaches the replay backend, which reads only the top level of data/fixtures/planner", () => {
    const scenarios = loadReplayRecords(join(FIXTURES_DIR, "planner")).map((r) => r.scenario);
    expect(scenarios.some((id) => id.startsWith("qwen-"))).toBe(false);
  });
});
