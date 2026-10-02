// @laisee/harness: seeded replay scenarios, B0/B1/B2 metrics. Owner: lane D.
// Import engine, ports and rail-sim from the packages; never copy them (lint enforces it).
export const BASELINES = ["B0", "B1", "B2"] as const;
export type Baseline = (typeof BASELINES)[number];
