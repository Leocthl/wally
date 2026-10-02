// Recorded planner scenarios in data/fixtures/planner: valid, honest, and equal to what the rule planner
// produces against the offline mock of Laya. Regenerate with UPDATE_PLANNER_FIXTURES=1.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIXTURES_DIR, listFixtureFiles, loadFixture } from "@laisee/core/testing/fixtures";
import { ALTERNATIVE_SUFFIX, createReplayPlanner } from "../src/planner/replay-planner";
import { startMockLaya, type MockLaya } from "./support/planner/mock-laya";
import { OPTS, fixtureListing, ALL_FIXTURE_LISTINGS } from "./support/planner/data";
import { SCENARIOS, fixtureText, recordScenario, scenarioContext } from "./support/planner/scenarios";

let mock: MockLaya;
beforeAll(async () => {
  mock = await startMockLaya();
});
afterAll(async () => {
  await mock.close();
});

const file = (id: string) => `planner/${id}.json`;

describe.runIf(process.env["UPDATE_PLANNER_FIXTURES"] === "1")("regenerating fixtures", () => {
  it("writes data/fixtures/planner from the rule planner against the mock", async () => {
    for (const s of SCENARIOS) {
      const data = await recordScenario(s, mock.url);
      writeFileSync(join(FIXTURES_DIR, file(s.id)), fixtureText(s, data));
    }
  });
});

describe("scenario set", () => {
  it("has at least eight new scenarios with unique ids that cover the required kinds", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    expect(SCENARIOS.map((s) => s.id)).toEqual(
      expect.arrayContaining(["clear-request", "ambiguous-request", "unavailable-variant", "over-budget", "over-budget-alternative", "injected-description", "empty-candidates", "near-equal-items", "quantity-request"]),
    );
    expect(listFixtureFiles().filter((f) => f.startsWith("planner/")).length).toBeGreaterThanOrEqual(6 + SCENARIOS.length);
  });
});

describe.each(SCENARIOS)("scenario $id", (s) => {
  it("has a valid fixture whose proposal matches the expectation", () => {
    const record = loadFixture(file(s.id), "planner-replay");
    expect(record.scenario).toBe(s.id);
    expect(record.listing_ids).toEqual(s.listings.map((l) => l.id).filter((id, i, all) => all.indexOf(id) === i));
    if (s.expected === null) expect(record.proposal).toBeNull();
    else expect(record.proposal?.items).toEqual([s.expected]);
  });

  it("equals what the rule planner produces against the mock (golden)", async () => {
    const fresh = await recordScenario(s, mock.url);
    const stored = loadFixture(file(s.id), "planner-replay");
    expect(stored).toEqual(fresh);
    expect(readFileSync(join(FIXTURES_DIR, file(s.id)), "utf8")).toBe(fixtureText(s, fresh));
  });

  it("is replayed unchanged by the replay backend for the same context", async () => {
    const stored = loadFixture(file(s.id), "planner-replay");
    const catalogue = s.resolvable ? [...ALL_FIXTURE_LISTINGS, ...s.listings] : ALL_FIXTURE_LISTINGS;
    // An alternatives record is selected through its base scenario id (the id without -alternative).
    const scenario = s.mode === "alternatives" ? s.id.slice(0, -ALTERNATIVE_SUFFIX.length) : s.id;
    const planner = createReplayPlanner({ records: [stored], catalogue, scenario });
    const out = s.mode === "alternatives" && s.stop !== undefined ? await planner.alternatives?.(scenarioContext(s), s.stop, OPTS) : await planner.propose(scenarioContext(s), OPTS);
    expect(out ?? null).toEqual(stored.proposal);
  });
});

describe("fixture hygiene", () => {
  it("records no money field and no listing text, and nothing a card could be read from (I8)", () => {
    const injected = fixtureListing("injected").text;
    for (const s of SCENARIOS) {
      const text = readFileSync(join(FIXTURES_DIR, file(s.id)), "utf8");
      expect(text).not.toContain(injected.slice(0, 40));
      expect(text).not.toMatch(/SYSTEM NOTE|total_minor|unit_price|amount|"limit|cvv|"pan"/i);
    }
  });

  it("the injected scenario proposes the same item as the storyline attempt-3b (the injection changed nothing)", () => {
    const a = loadFixture(file("injected-description"), "planner-replay").proposal;
    const b = loadFixture("planner/attempt-3b.json", "planner-replay").proposal;
    expect(a?.items.map((i) => i.title)).toEqual(b?.items.map((i) => i.title));
  });
});
