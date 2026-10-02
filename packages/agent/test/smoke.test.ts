import { describe, expect, it } from "vitest";
import { FakePlanner } from "@laisee/core/testing";
import { loadFixture } from "@laisee/core/testing/fixtures";
import { JUDGE_PROVIDERS, JUDGE_QUESTIONS } from "../src/judge";
import { DEFAULT_PLANNER_PROVIDER, PLANNER_PROVIDERS } from "../src/planner";

describe("@laisee/agent scaffold", () => {
  it("exposes the provider enums from the contract", () => {
    expect(JUDGE_PROVIDERS).toEqual(["laya", "jev", "replay"]);
    expect(JUDGE_QUESTIONS).toHaveLength(4);
    expect(PLANNER_PROVIDERS).toContain(DEFAULT_PLANNER_PROVIDER);
  });

  it("can replay a recorded planner output through the PlannerPort shape", async () => {
    const replay = loadFixture("planner/attempt-1.json", "planner-replay");
    const planner = new FakePlanner([replay.proposal]);
    const proposal = await planner.propose({ intentText: "clothes", listings: [] }, { timeoutMs: 1000 });
    expect(proposal?.items[0]?.qty).toBe(1);
  });
});
