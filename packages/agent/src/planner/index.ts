// @laisee/agent/planner: PlannerPort backends rule (default) and replay. Owner: lane B.
// No credentials, no card handle, no rail, no log (I4). A claude backend is not built. Node only (replay reads files).
//
// Composition root (apps/web), server side:
//   const planner = createPlanner({
//     provider: plannerProviderFromEnv(process.env),          // PLANNER_PROVIDER: rule (default) | replay
//     catalogue: listingRecords,                              // the same records the cart builder prices from
//     layaUrl: layaUrlFromEnv(process.env),                   // LAYA_URL, loopback only
//     records: loadReplayRecords(".../data/fixtures/planner"), // replay backend
//     scenario: "attempt-1",                                  // replay: fixed scenario, else chosen by listing set
//   });
//   const proposal = await planner.propose({ intentText, listings }, { timeoutMs, onTrace });  // null = ask the shopper
// `intentText` must carry the shopper's request (the item they want), not only the mandate sentence.
import type { PlannerProvider } from "@laisee/core/ports";

export const PLANNER_PROVIDERS: readonly PlannerProvider[] = ["rule", "replay"];
export const DEFAULT_PLANNER_PROVIDER: PlannerProvider = "rule";

export { DEFAULT_LAYA_URL, DEFAULT_PLANNER_CONFIG, PlannerConfigError, type PlannerConfig } from "./config";
export { createPlanner, layaUrlFromEnv, plannerProviderFromEnv, type CreatePlannerOptions } from "./factory";
export { createRulePlanner, type RulePlannerOptions } from "./rule-planner";
export { ALTERNATIVE_SUFFIX, createReplayPlanner, loadReplayRecords, type ReplayPlannerOptions } from "./replay-planner";
export { parseColours, parseQuantity, parseSizes, MAX_QTY, type QuantityResult } from "./parse-request";
export { candidatesFromListing, parseTitle, type PlannerCandidate } from "./candidates";
