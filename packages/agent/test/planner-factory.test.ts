// PLANNER_PROVIDER selection: rule (default) and replay; claude is not built.
import { describe, expect, it } from "vitest";
import type { ListingRecord, PlannerReplayRecord } from "@laisee/core/generated";
import { PlannerConfigError } from "../src/planner/config";
import { createPlanner, layaUrlFromEnv, plannerProviderFromEnv } from "../src/planner/factory";
import { DEFAULT_PLANNER_PROVIDER, PLANNER_PROVIDERS } from "../src/planner";
import { ALL_FIXTURE_LISTINGS, OPTS, ctxOf, fixtureListing } from "./support/planner-data";

describe("plannerProviderFromEnv", () => {
  it("defaults to rule", () => {
    expect(plannerProviderFromEnv({})).toBe("rule");
    expect(plannerProviderFromEnv({ PLANNER_PROVIDER: "" })).toBe("rule");
    expect(plannerProviderFromEnv({ PLANNER_PROVIDER: " rule " })).toBe("rule");
    expect(DEFAULT_PLANNER_PROVIDER).toBe("rule");
  });

  it("accepts replay", () => {
    expect(plannerProviderFromEnv({ PLANNER_PROVIDER: "replay" })).toBe("replay");
  });

  it("refuses claude (not built) and unknown names at start-up", () => {
    expect(() => plannerProviderFromEnv({ PLANNER_PROVIDER: "claude" })).toThrow(/no claude backend/);
    expect(() => plannerProviderFromEnv({ PLANNER_PROVIDER: "gpt" })).toThrow(PlannerConfigError);
  });

  it("lists only the built providers", () => {
    expect([...PLANNER_PROVIDERS]).toEqual(["rule", "replay"]);
  });
});

describe("layaUrlFromEnv", () => {
  it("defaults to the local server and reads LAYA_URL", () => {
    expect(layaUrlFromEnv({})).toBe("http://127.0.0.1:8808");
    expect(layaUrlFromEnv({ LAYA_URL: "http://localhost:9000" })).toBe("http://localhost:9000");
  });
});

describe("createPlanner", () => {
  const tee = fixtureListing("tee");

  it("builds a rule planner that refuses a remote Laya url", () => {
    expect(() => createPlanner({ provider: "rule", catalogue: ALL_FIXTURE_LISTINGS, layaUrl: "https://example.com" })).toThrow(/loopback/i);
    const planner = createPlanner({ provider: "rule", catalogue: ALL_FIXTURE_LISTINGS });
    expect(typeof planner.propose).toBe("function");
    expect(typeof planner.alternatives).toBe("function");
  });

  it("builds a replay planner", async () => {
    const records: PlannerReplayRecord[] = [{ scenario: "t", listing_ids: [tee.id], proposal: { listing_url: tee.url, items: [{ title: tee.items[0]?.title ?? "", qty: 1 }] } }];
    const planner = createPlanner({ provider: "replay", records, catalogue: [tee], scenario: "t" });
    expect((await planner.propose(ctxOf("x", [tee]), OPTS))?.listing_url).toBe(tee.url);
  });

  it("refuses the claude provider", () => {
    expect(() => createPlanner({ provider: "claude" })).toThrow(PlannerConfigError);
  });

  it("rejects an invalid catalogue record at start-up", () => {
    const broken = { ...tee, items: [] } as unknown as ListingRecord; // invalid on purpose: no items
    expect(() => createPlanner({ provider: "rule", catalogue: [broken] })).toThrow(PlannerConfigError);
  });
});
