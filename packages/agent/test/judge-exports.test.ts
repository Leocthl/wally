import { describe, expect, it } from "vitest";
import * as judge from "../src/judge";

describe("@wally/agent/judge public surface (other lanes import these)", () => {
  it("exports the adapters, factory, warm-up helpers, windows and corpus loader", () => {
    for (const name of [
      "SystemOneJudge",
      "ReplayJudge",
      "ShadowJudge",
      "createJudge",
      "createJudgeFromEnv",
      "parseJudgeEnv",
      "JudgeConfigError",
      "loadReplayRecordings",
      "ReplayLoadError",
      "isWarmable",
      "splitListing",
      "combineWindowAnswers",
      "DEFAULT_WINDOWING",
      "loadCorpus",
      "CORPUS_CATEGORIES",
      "JUDGE_PROVIDERS",
      "JUDGE_QUESTIONS",
      "QUESTION_OPTIONS",
    ] as const) {
      expect(judge[name], name).toBeDefined();
    }
  });

  it("loads the corpus through the package export", () => {
    expect(judge.loadCorpus().length).toBeGreaterThanOrEqual(60);
  });
});
