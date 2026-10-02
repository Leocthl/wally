// @laisee/harness: seeded replay scenarios, B0/B1/B2 systems, metrics and the result file. Owner: lane D.
// Engine, rail and judge come from the packages through factory.ts; nothing here copies them (lint enforces it).
export { BASELINES, type Baseline, type Category, type Scenario, type ScenarioLabel } from "./types";
export { ACCEPTANCE, CATEGORIES, SCENARIO_COUNT } from "./config";
export { generateScenarios, type GenerateOptions } from "./scenario/generate";
export { createComponents, createCartBuilder, describeComponents, type ComponentReport } from "./factory";
export { createSystems } from "./systems/create";
export type { CheckoutExecutor, Components, RunOutcome, SystemDeps, SystemUnderTest } from "./systems/types";
export type { ChoiceClient, ChoiceRequest, ChoiceResult } from "./judge/choice-client";
export { createLayaClient } from "./judge/laya-client";
export { createChoiceJudge } from "./judge/choice-judge";
export { createLiveSource, createRecordedSource, createClientSource, probeLaya, type JudgeSource } from "./judge/sources";
export { parseRecording, type Recording } from "./judge/recording";
export { runHarness, type RunInput, type RunOutput } from "./run";
export { evaluateAcceptance } from "./report/acceptance";
export { formatRatio, ratio, type Ratio } from "./ratio";
