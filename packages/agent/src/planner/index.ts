// @laisee/agent/planner: PlannerPort backends rule (default), replay, claude. Owner: lane B.
// No credentials, no card handle, no rail, no log (I4).
import type { PlannerProvider } from "@laisee/core/ports";

export const PLANNER_PROVIDERS: readonly PlannerProvider[] = ["rule", "replay", "claude"];
export const DEFAULT_PLANNER_PROVIDER: PlannerProvider = "rule";
