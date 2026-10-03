// The fixed booth buttons must show the same stop every time: when the live planner (Qwen, Laya loop) makes no proposal for
// a scenario's own listing set, the recorded planner output stands in. A free-text ask lists the whole shelf, so it never
// falls back and "Wally could not tell which item you meant" stays true.
import type { ListingRecord } from "@wally/core/generated";
import type { PlannerContext, PlannerPort } from "@wally/core/ports";
import { describe, expect, it, vi } from "vitest";
import { loadBundle } from "../src/api/local/bundle";
import { replayPlannerFactory, withRecordedFallback } from "../src/booth/backend/planner";

const bundle = loadBundle();
const listing = (id: string): ListingRecord => {
  const found = bundle.catalogue.listings.get(id);
  if (found === undefined) throw new Error(`no listing ${id}`);
  return found;
};
/** What the orchestrator hands a planner: the request and the listing urls, never the listing text (I4). */
const ctxFor = (requestText: string, listings: readonly ListingRecord[]): PlannerContext => ({ intentText: requestText, listings: listings.map((l) => ({ url: l.url, text: "" })) });
const OPTS = { timeoutMs: 1_000 };
const declines: PlannerPort = { propose: vi.fn(async () => null) };

describe("withRecordedFallback", () => {
  it("uses the recorded planner output for a fixed scenario when the live planner makes no proposal", async () => {
    const flagged = [listing("lst_flaggedHoodie")];
    const ctx = ctxFor("a fleece hoodie", flagged);
    const recorded = await replayPlannerFactory(bundle.plannerRecords, bundle.table)(flagged).propose(ctx, OPTS);
    expect(recorded).not.toBeNull();
    const planner = withRecordedFallback(() => declines, bundle.plannerRecords, bundle.table)(flagged);
    expect(await planner.propose(ctx, OPTS)).toEqual(recorded);
    expect(declines.propose).toHaveBeenCalled();
  });

  it("keeps the live proposal when there is one", async () => {
    const flagged = [listing("lst_flaggedHoodie")];
    const live = { cart: "live" } as never;
    const planner = withRecordedFallback(() => ({ propose: async () => live }), bundle.plannerRecords, bundle.table)(flagged);
    expect(await planner.propose(ctxFor("a fleece hoodie", flagged), OPTS)).toBe(live);
  });

  it("never falls back for a listing set the table does not name (a free-text ask on the whole shelf)", async () => {
    const shelf = [...bundle.catalogue.listings.values()];
    const planner = withRecordedFallback(() => declines, bundle.plannerRecords, bundle.table)(shelf);
    expect(await planner.propose(ctxFor("a fleece hoodie", shelf), OPTS)).toBeNull();
  });

  it("passes the alternatives method through untouched", () => {
    const alternatives = vi.fn(async () => null);
    const planner = withRecordedFallback(() => ({ propose: async () => null, alternatives }), bundle.plannerRecords, bundle.table)([listing("lst_flaggedHoodie")]);
    expect(planner.alternatives).toBeTypeOf("function");
  });
});
