// @laisee/rail-sim: RailPort implementation and merchant stub, SIMULATED. Owner: lane A.
// Placeholder from the foundation scaffold; use FakeRail from @laisee/core/testing until this lands.

/** Merchant stub modes (CONTRACT V2 section 2.4). */
export const MERCHANT_MODES = ["honest", "overshoot", "drift", "preauth", "timeout", "wrong_merchant"] as const;
export type MerchantMode = (typeof MERCHANT_MODES)[number];

export const RAIL_LABEL = "SIMULATED";
