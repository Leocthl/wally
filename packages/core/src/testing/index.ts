// @wally/core/testing: fakes for tests and wiring (not the real rail-sim, judge or planner).
// Browser-safe. The Node-only fixture loader lives at @wally/core/testing/fixtures.
export { FakeClock, FAKE_CLOCK_START } from "./clock";
export { MemoryLogStore, LogAppendError, type MemoryLogStoreOptions } from "./log-store";
export { FakeJudge, CLEAN_ANSWERS, type FakeJudgeOptions, type FakeJudgeResponse } from "./judge";
export { FakeRail, type FakeRailOptions } from "./rail";
export { FakePlanner, type FakeAlternativeCall, type FakePlannerScript } from "./planner";
export { FakeMerchant } from "./merchant";
export { placeholderEntry, PLACEHOLDER_SIGNATURE, PLACEHOLDER_ENGINE_DID } from "./entries";
