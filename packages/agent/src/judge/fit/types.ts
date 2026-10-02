import type { JudgeAnswers } from "@laisee/core/generated";
import type { CorpusCategory, CorpusLabels } from "./corpus";
import type { ScameterState } from "./inputs";

/** One corpus case after one judge call. Non-OK results carry no answers. */
export interface CaseResult {
  readonly id: string;
  readonly category: CorpusCategory;
  readonly labels: CorpusLabels;
  readonly scameterState: ScameterState;
  readonly status: "OK" | "TIMEOUT" | "ERROR";
  readonly inputTruncated: boolean;
  /** MEASURED wall time of the judge step. */
  readonly latencyMs: number;
  readonly answers: JudgeAnswers | null;
}
