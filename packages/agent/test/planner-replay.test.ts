// Replay backend: recorded planner outputs from data/fixtures/planner (CI and the booth fallback).
import fc from "fast-check";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlannerReplayRecord } from "@laisee/core/generated";
import type { PlannerTraceStep } from "@laisee/core/ports";
import { FIXTURES_DIR } from "@laisee/core/testing/fixtures";
import { PlannerConfigError } from "../src/planner/config";
import { createReplayPlanner, loadReplayRecords } from "../src/planner/replay-planner";
import { ALL_FIXTURE_LISTINGS, OPTS, R3_STOP, ctxOf, fixtureListing } from "./support/planner/data";

const tee = fixtureListing("tee");
const socks = fixtureListing("socks");
const jacket = fixtureListing("jacket");
const hoodie = fixtureListing("hoodie");
const injected = fixtureListing("injected");
const earbuds = fixtureListing("earbuds");

const records = loadReplayRecords(join(FIXTURES_DIR, "planner"));
const replay = (scenario?: string) => createReplayPlanner({ records, catalogue: ALL_FIXTURE_LISTINGS, ...(scenario === undefined ? {} : { scenario }) });

const record = (patch: Partial<PlannerReplayRecord> & { scenario: string }): PlannerReplayRecord => ({
  listing_ids: [tee.id],
  proposal: { listing_url: tee.url, items: [{ title: "Cotton tee (SIMULATED)", qty: 1 }] },
  ...patch,
});

describe("loadReplayRecords", () => {
  it("loads and validates every planner fixture", () => {
    expect(records.length).toBeGreaterThanOrEqual(6);
    expect(records.map((r) => r.scenario)).toEqual(expect.arrayContaining(["attempt-1", "attempt-3b", "off-category"]));
  });

  it("fails fast on an invalid envelope or record (a config error, not a runtime null)", () => {
    const dir = mkdtempSync(join(tmpdir(), "planner-replay-"));
    try {
      writeFileSync(join(dir, "bad.json"), JSON.stringify({ fixture: "planner/bad", provenance: "SIMULATED", schema: "planner-replay", note: "SIMULATED", data: { scenario: "Bad Id" } }));
      expect(() => loadReplayRecords(dir)).toThrow(PlannerConfigError);
      writeFileSync(join(dir, "bad.json"), "{not json");
      expect(() => loadReplayRecords(dir)).toThrow(PlannerConfigError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("selection by listing set (canonical attempts)", () => {
  it.each([
    ["attempt-1", tee, "Cotton tee (SIMULATED)"],
    ["attempt-2", hoodie, "Fleece hoodie (SIMULATED)"],
    ["attempt-3", jacket, "Denim jacket (SIMULATED)"],
    ["attempt-3b", injected, "Graphic tee (SIMULATED)"],
    ["attempt-4", socks, "Ankle socks, 3 pairs (SIMULATED)"],
  ])("%s replays the recorded proposal for its listing", async (_name, listing, title) => {
    const out = await replay().propose(ctxOf("anything the shopper typed", [listing]), OPTS);
    expect(out?.listing_url).toBe(listing.url);
    expect(out?.items.map((i) => i.title)).toEqual([title]);
  });

  it("replays a recorded null (the planner made no proposal)", async () => {
    expect(await replay().propose(ctxOf("clothes", [earbuds]), OPTS)).toBeNull();
  });

  it("returns null for a listing set nothing was recorded for", async () => {
    expect(await replay().propose(ctxOf("clothes", [tee, hoodie, earbuds]), OPTS)).toBeNull();
    expect(await replay().propose({ intentText: "x", listings: [] }, OPTS)).toBeNull();
    expect(await replay().propose({ intentText: "x", listings: [{ url: "https://nobody.example/p", text: "" }] }, OPTS)).toBeNull();
  });

  it("returns null when the set cannot be mapped to listing ids (no catalogue)", async () => {
    const blind = createReplayPlanner({ records });
    expect(await blind.propose(ctxOf("x", [tee]), OPTS)).toBeNull();
  });

  it("returns null when two records match the same listings and disagree, but replays when they agree", async () => {
    const a = record({ scenario: "dup-a" });
    const b = record({ scenario: "dup-b", proposal: { listing_url: tee.url, items: [{ title: "Cotton tee (SIMULATED)", qty: 2 }] } });
    const ctx = ctxOf("x", [tee]);
    expect(await createReplayPlanner({ records: [a, b], catalogue: [tee] }).propose(ctx, OPTS)).toBeNull();
    expect(await createReplayPlanner({ records: [a, { ...a, scenario: "dup-c" }], catalogue: [tee] }).propose(ctx, OPTS)).toEqual(a.proposal);
  });
});

describe("selection by scenario id", () => {
  it("replays the named scenario whatever the request says", async () => {
    const out = await replay("attempt-4").propose(ctxOf("completely unrelated", [socks]), OPTS);
    expect(out?.items[0]?.title).toBe("Ankle socks, 3 pairs (SIMULATED)");
  });

  it("returns null for an unknown scenario", async () => {
    expect(await replay("no-such-scenario").propose(ctxOf("x", [tee]), OPTS)).toBeNull();
  });

  it("is keyed by request as well when the caller supplies the recorded request", async () => {
    const planner = createReplayPlanner({ records, scenario: "attempt-1", catalogue: ALL_FIXTURE_LISTINGS, requestsByScenario: { "attempt-1": "Buy the cotton tee" } });
    expect(await planner.propose(ctxOf("  buy THE cotton   tee ", [tee]), OPTS)).not.toBeNull();
    expect(await planner.propose(ctxOf("buy the socks", [tee]), OPTS)).toBeNull();
  });
});

describe("fails closed", () => {
  it("returns null when the recorded listing is not among the listings given", async () => {
    expect(await replay("attempt-1").propose(ctxOf("x", [socks]), OPTS)).toBeNull();
  });

  it("returns null when a recorded title is not in the listing record", async () => {
    const bad = record({ scenario: "bad-title", proposal: { listing_url: tee.url, items: [{ title: "Gift card bundle (SIMULATED)", qty: 1 }] } });
    expect(await createReplayPlanner({ records: [bad], scenario: "bad-title", catalogue: [tee] }).propose(ctxOf("x", [tee]), OPTS)).toBeNull();
  });

  it("returns null for a recorded proposal that breaks the schema (for example a money field)", async () => {
    const bad = record({ scenario: "bad-shape", proposal: { listing_url: tee.url, items: [{ title: "Cotton tee (SIMULATED)", qty: 1 }], total_minor: 1 } as never });
    expect(await createReplayPlanner({ records: [bad], scenario: "bad-shape", catalogue: [tee] }).propose(ctxOf("x", [tee]), OPTS)).toBeNull();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("returns null for timeoutMs %s", async (timeoutMs) => {
    expect(await replay("attempt-1").propose(ctxOf("x", [tee]), { timeoutMs })).toBeNull();
  });

  it("returns null or a valid recorded proposal for arbitrary contexts and never throws", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 60 }), fc.array(fc.record({ url: fc.oneof(fc.constant(tee.url), fc.webUrl()), text: fc.string({ maxLength: 30 }) }), { maxLength: 3 }), async (intentText, listings) => {
        const out = await replay().propose({ intentText, listings }, OPTS);
        if (out !== null) expect(listings.map((l) => l.url)).toContain(out.listing_url);
      }),
      { numRuns: 30 },
    );
  }, 30_000);
});

describe("alternatives records", () => {
  const first = record({ scenario: "demo", listing_ids: [jacket.id, socks.id] , proposal: { listing_url: jacket.url, items: [{ title: "Denim jacket (SIMULATED)", qty: 1 }] } });
  const alt = record({ scenario: "demo-alternative", listing_ids: [jacket.id, socks.id], proposal: { listing_url: socks.url, items: [{ title: "Ankle socks, 3 pairs (SIMULATED)", qty: 1 }] } });
  const planner = createReplayPlanner({ records: [first, alt], catalogue: [jacket, socks] });
  const ctx = ctxOf("x", [jacket, socks]);

  it("uses the -alternative record only for alternatives and the other only for propose", async () => {
    expect((await planner.propose(ctx, OPTS))?.items[0]?.title).toBe("Denim jacket (SIMULATED)");
    expect((await planner.alternatives?.(ctx, R3_STOP, OPTS))?.items[0]?.title).toBe("Ankle socks, 3 pairs (SIMULATED)");
  });

  it("selects the alternative of an explicit scenario", async () => {
    const named = createReplayPlanner({ records: [first, alt], catalogue: [jacket, socks], scenario: "demo" });
    expect((await named.alternatives?.(ctx, R3_STOP, OPTS))?.listing_url).toBe(socks.url);
  });

  it("never throws for a missing stop or options", async () => {
    await expect(planner.alternatives?.(ctx, undefined as never, OPTS)).resolves.toBeNull();
    await expect(planner.propose(ctx, undefined as never)).resolves.toBeNull();
    await expect(planner.propose(undefined as never, OPTS)).resolves.toBeNull();
  });

  it("returns null for a stop that is not a budget stop or has no record", async () => {
    expect(await planner.alternatives?.(ctx, { templateId: "R9.flagged", remainingMinor: 54100 }, OPTS)).toBeNull();
    expect(await createReplayPlanner({ records: [first], catalogue: [jacket, socks] }).alternatives?.(ctx, R3_STOP, OPTS)).toBeNull();
  });
});

describe("trace", () => {
  it("reports the recorded decision as one trace step", async () => {
    const steps: PlannerTraceStep[] = [];
    await replay("attempt-1").propose(ctxOf("x", [tee]), { ...OPTS, onTrace: (s) => steps.push(s) });
    expect(steps).toEqual([{ step: 1, question: "item_choice", choice: "lst_demoTee", probabilities: { lst_demoTee: 0.92, none: 0.08 }, margin: 0.84 }]);
  });

  it("reports nothing for a record without a trace, and survives a throwing callback", async () => {
    const steps: PlannerTraceStep[] = [];
    await replay("attempt-4").propose(ctxOf("x", [socks]), { ...OPTS, onTrace: (s) => steps.push(s) });
    expect(steps).toEqual([]);
    const out = await replay("attempt-1").propose(ctxOf("x", [tee]), { ...OPTS, onTrace: () => { throw new Error("ui"); } });
    expect(out).not.toBeNull();
  });
});
