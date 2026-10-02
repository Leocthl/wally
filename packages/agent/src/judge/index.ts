// @laisee/agent/judge: SystemOneJudge (laya, jev) and the replay judge. Owner: lane B.
// May import @laisee/core/ports, generated, schema and config only (lint enforces I4).
import type { JudgeProvider } from "@laisee/core/generated";

export const JUDGE_PROVIDERS: readonly JudgeProvider[] = ["laya", "jev", "replay"];
export const JUDGE_QUESTIONS = ["scope_fit", "injection_risk", "seller_risk", "escalate_or_proceed"] as const;
export type JudgeQuestion = (typeof JUDGE_QUESTIONS)[number];
