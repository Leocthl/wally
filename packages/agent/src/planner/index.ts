// @laisee/agent/planner: PlannerPort backends rule (default) and replay. Owner: lane B.
// No credentials, no card handle, no rail, no log (I4). A claude backend is not built.
import type { PlannerProvider } from "@laisee/core/ports";

export const PLANNER_PROVIDERS: readonly PlannerProvider[] = ["rule", "replay"];
export const DEFAULT_PLANNER_PROVIDER: PlannerProvider = "rule";

export { DEFAULT_LAYA_URL, DEFAULT_PLANNER_CONFIG, PlannerConfigError, type PlannerConfig } from "./config";
export { createRulePlanner, type RulePlannerOptions } from "./rule-planner";
export { parseColours, parseQuantity, parseSizes, MAX_QTY, type QuantityResult } from "./parse-request";
export { candidatesFromListing, parseTitle, type PlannerCandidate } from "./candidates";
