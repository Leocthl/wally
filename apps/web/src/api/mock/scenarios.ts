// Scenario specs: which recorded listing, planner proposal, Scameter capture and judge answers each preset replays.
// All SIMULATED fixtures [F59]; capture ages are restamped to "now" so a booth run on any day behaves the same.
import type { Cart, ListingRecord, ProposeCartInput, ScameterCapture } from "@laisee/core/generated";
import type { PlannerTraceInfo } from "../types";
import { STORY_GAP } from "./config";
import { JUDGE_RECORDS, LISTINGS, PLANNER_REPLAYS, REFERENCE_CART, SCAMETER } from "./fixtures";
import type { PurchaseSpec } from "./flows";
import { heuristicJudge, recordedJudge } from "./judge";
import type { MockSession } from "./session";

export type PresetKey = "tee" | "socks" | "hoodie" | "overflow" | "injected" | "unverified";

const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");
/** Usual capture age: the reference cart's proposed_at minus its Scameter captured_at (35 min in the fixture). */
const FRESH_AGE_MS = Date.parse(REFERENCE_CART.proposed_at) - Date.parse(REFERENCE_CART.scameter.captured_at ?? REFERENCE_CART.proposed_at);
/** The stale fixture is older than the F52 limit by the same gap it has against the reference cart. */
const STALE_AGE_MS = Date.parse(REFERENCE_CART.proposed_at) - Date.parse(SCAMETER.stale.captured_at);

function scameterAt(capture: ScameterCapture, now: Date, ageMs: number): Cart["scameter"] {
  return { state: capture.state, capture_ref: capture.capture_ref, captured_at: iso(now.getTime() - ageMs), searched: capture.searched };
}

function plannerInfo(key: keyof typeof PLANNER_REPLAYS): PlannerTraceInfo {
  const trace = PLANNER_REPLAYS[key].trace;
  const fallbackMs = PLANNER_REPLAYS.tee.trace?.latency_ms;
  const latencyMs = trace?.latency_ms ?? fallbackMs;
  return {
    provider: "replay",
    ...(trace?.choice ? { choice: trace.choice } : {}),
    ...(trace ? { probabilities: trace.probabilities as Record<string, number> } : {}),
    ...(latencyMs === undefined ? {} : { latencyMs }),
  };
}

function proposalFor(key: keyof typeof PLANNER_REPLAYS, listing: ListingRecord): ProposeCartInput {
  const recorded = PLANNER_REPLAYS[key].proposal;
  if (!recorded) throw new Error(`recorded planner output for ${key} made no proposal`);
  return { ...recorded, listing_url: listing.url };
}

/** The jacket listing priced just under what is left, so shipping tips it over (F22 shape: under, plus shipping, equals over). */
function overflowListing(remainingMinor: number): ListingRecord {
  const base = LISTINGS.jacket;
  const first = base.items[0];
  const price = remainingMinor - STORY_GAP.underMinor;
  if (price < 1) return base;
  return { ...base, items: [{ ...first, unit_price_minor: price }] };
}

/** Same tee, but from a merchant whose Scameter capture is older than the F52 limit. */
function vintageListing(): ListingRecord {
  return {
    ...LISTINGS.tee,
    url: "https://demo-vintage.example/p/tee",
    merchant: { name: "Demo Vintage (SIMULATED)", domain: "demo-vintage.example" },
    seller: "Demo Vintage (SIMULATED), no recent record",
    scameter_ref: SCAMETER.stale.capture_ref,
  };
}

export function presetSpec(s: MockSession, runId: string, key: PresetKey): PurchaseSpec {
  const now = s.now();
  switch (key) {
    case "tee":
      return { runId, listing: LISTINGS.tee, proposal: proposalFor("tee", LISTINGS.tee), planner: plannerInfo("tee"), scameter: scameterAt(SCAMETER.apparel, now, FRESH_AGE_MS), judge: recordedJudge("tee") };
    case "socks":
      return { runId, listing: LISTINGS.socks, proposal: proposalFor("socks", LISTINGS.socks), planner: plannerInfo("socks"), scameter: scameterAt(SCAMETER.apparel, now, FRESH_AGE_MS), judge: recordedJudge("socks") };
    case "hoodie":
      return { runId, listing: LISTINGS.hoodie, proposal: proposalFor("hoodie", LISTINGS.hoodie), planner: plannerInfo("hoodie"), scameter: scameterAt(SCAMETER.flagged, now, FRESH_AGE_MS), judge: recordedJudge("hoodie") };
    case "overflow": {
      const listing = overflowListing(s.packet().remaining_minor);
      return { runId, listing, proposal: proposalFor("jacket", listing), planner: plannerInfo("jacket"), scameter: scameterAt(SCAMETER.streetwear, now, FRESH_AGE_MS), judge: recordedJudge("jacket") };
    }
    case "injected":
      return { runId, listing: LISTINGS.injected, proposal: proposalFor("injected", LISTINGS.injected), planner: plannerInfo("injected"), scameter: scameterAt(SCAMETER.outlet, now, FRESH_AGE_MS), judge: recordedJudge("injected") };
    case "unverified": {
      const listing = vintageListing();
      return { runId, listing, proposal: proposalFor("tee", listing), planner: plannerInfo("tee"), scameter: scameterAt(SCAMETER.stale, now, STALE_AGE_MS), judge: recordedJudge("tee") };
    }
  }
}

/** Free text a visitor typed: rule planner takes the first item; the keyword stand-in judge reads the text (not Laya). */
export function customSpec(s: MockSession, runId: string, listingText: string): PurchaseSpec {
  const listing: ListingRecord = { ...LISTINGS.injected, text: listingText, seller: "Visitor-written listing (SIMULATED)", provenance: "SIMULATED" };
  const first = listing.items[0];
  return {
    runId,
    listing,
    proposal: { listing_url: listing.url, items: [{ title: first.title, qty: 1 }], note: "Rule planner: first item on the listing." },
    planner: { provider: "rule", ...(PLANNER_REPLAYS.tee.trace?.latency_ms === undefined ? {} : { latencyMs: PLANNER_REPLAYS.tee.trace.latency_ms }) },
    scameter: scameterAt(SCAMETER.outlet, s.now(), FRESH_AGE_MS),
    judge: heuristicJudge(listingText),
  };
}

export { JUDGE_RECORDS };
