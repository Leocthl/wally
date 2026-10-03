// @wally/agent/judge: JudgePort adapters. Owner: lane B.
//   SystemOneJudge  laya (local, default) and jev (hosted, optional): one typed wire protocol
//   ReplayJudge     recorded answers (CI and the booth fallback), clearly labelled
//   ShadowJudge     JUDGE_MODE=shadow: record the verdict, change nothing
// May import @wally/core/ports, generated, schema and config only (lint enforces I4).
import type { JudgeProvider } from "@wally/core/generated";

export const JUDGE_PROVIDERS: readonly JudgeProvider[] = ["laya", "jev", "replay"];

export { JUDGE_QUESTIONS, QUESTION_OPTIONS, SHIPPED_WORDING_VARIANT, type JudgeQuestion, type JudgeQuestionDefs } from "./questions";
export { SystemOneJudge, type SystemOneJudgeOptions } from "./system-one-judge";
export { ReplayJudge, type ReplayJudgeOptions } from "./replay-judge";
export { loadReplayRecordings, ReplayLoadError, type ReplayRecording } from "./replay-recordings";
export { ShadowJudge } from "./shadow-judge";
export {
  JudgeConfigError,
  createJudge,
  createJudgeFromEnv,
  parseJudgeEnv,
  type CreateJudgeDeps,
  type JudgeEnv,
  type JudgeMode,
  type JudgeSettings,
  type SettingsResult,
} from "./create-judge";
export type { DiagnosticReason, DiagnosticSink, JudgeDiagnostic } from "./diagnostics";
export { DEFAULT_WINDOWING, combineWindowAnswers, splitListing, type WindowPlan, type WindowingOptions } from "./windows";
export { isWarmable, type WarmUpOptions, type WarmUpResult, type WarmableJudge } from "./warm-up";
export { loadCorpus, CORPUS_CATEGORIES, type CorpusCase, type CorpusCategory, type CorpusLabels } from "./fit/corpus";
