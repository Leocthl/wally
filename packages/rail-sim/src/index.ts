// @laisee/rail-sim: RailPort implementation and merchant stub, SIMULATED. Owner: lane A.
// RailSim mirrors the Single Use Card [F1]: no real card exists, only an opaque handle and a random last4 (I8).
// Use FakeRail from @laisee/core/testing for unit tests that do not need these semantics.
// Node-only helpers (loading a calibrated decline table from a file) live in @laisee/rail-sim/node.
//
// Wiring (apps/web, harness):
//   const rail = new RailSim();                                  // pass random: seededRandom(seed) for replays
//   const shop = new MerchantStub({ rail, mode: "honest" });     // shop.setMode("overshoot") for the DM2 beat
//   const executor = createExecutor({ merchant: shop, rail, store, signer, appendEntry, clock }); // @laisee/core/executor
export { RAIL_LABEL, RAIL_SIM_DEFAULTS, SIMULATED_SURCHARGE_MINOR, WRONG_MERCHANT_DOMAIN } from "./config";
export {
  DECLINE_CODES,
  DEFAULT_DECLINE_TABLE,
  DeclineTableError,
  parseDeclineTable,
  type DeclineCode,
  type DeclineEntry,
  type DeclineHold,
  type DeclineInfo,
  type DeclineShowsAt,
  type DeclineTable,
  type DeclineTiming,
} from "./decline-table";
export { RailSimError, type RailSimErrorCode } from "./errors";
export { createIdSource, cryptoRandom, seededRandom, sequentialIds, type IdSource, type RandomSource } from "./ids";
export { MERCHANT_MODES, MerchantStub, type MerchantMode, type MerchantStubOptions, type TimeoutPhase } from "./merchant-stub";
export type { MintLimits } from "./mint-rules";
export { RailSim, type CardLedger, type RailSimOptions } from "./rail-sim";
