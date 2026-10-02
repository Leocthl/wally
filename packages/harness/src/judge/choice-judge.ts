// A JudgePort built on a ChoiceClient: the four judge questions, one call, mapped to a JudgeRecord. Interim stand-in
// for SystemOneJudge in @laisee/agent/judge (TASKS B-14): the factory swaps it in when that lands. Never throws.
import type { JudgeAnswers } from "@laisee/core/generated";
import type { JudgeInput, JudgePort, JudgeRecord } from "@laisee/core/ports";
import { validateJudgeRecord } from "@laisee/core/schema";
import type { Timer } from "../timer";
import type { ChoiceAnswer, ChoiceClient, ChoiceResult } from "./choice-client";
import { JUDGE_QUESTIONS } from "./questions";
import { judgeState } from "./state";

export interface ChoiceJudgeOptions {
  readonly client: ChoiceClient;
  readonly timer: Timer;
  /** Label for the record: "laya" for a live run, "replay" for recorded answers. */
  readonly provider: JudgeRecord["provider"];
  readonly version: string;
}

const probs = (a: ChoiceAnswer | undefined): Readonly<Record<string, number>> => a?.probabilities ?? {};

function toAnswers(answers: Readonly<Record<string, ChoiceAnswer>>): JudgeAnswers {
  const get = (q: string, label: string): number => probs(answers[q])[label] ?? Number.NaN;
  return {
    scope_fit: { in_scope: get("scope_fit", "in_scope"), out_of_scope: get("scope_fit", "out_of_scope") },
    injection_risk: { clean: get("injection_risk", "clean"), suspicious: get("injection_risk", "suspicious"), injection: get("injection_risk", "injection") },
    seller_risk: { low_risk: get("seller_risk", "low_risk"), high_risk: get("seller_risk", "high_risk") },
    escalate_or_proceed: { proceed: get("escalate_or_proceed", "proceed"), escalate: get("escalate_or_proceed", "escalate") },
  };
}

export function createChoiceJudge(opts: ChoiceJudgeOptions): JudgePort {
  const base = { provider: opts.provider, model: "typed-decisions", version: opts.version, shadow: false } as const;
  const failed = (status: "TIMEOUT" | "ERROR", latencyMs: number, extra: { input_truncated?: true } = {}): JudgeRecord => ({
    ...base,
    status,
    latency_ms: Math.max(0, Math.round(latencyMs)),
    ...extra,
  });

  function fromResult(result: ChoiceResult): JudgeRecord {
    if (!result.ok) return failed(result.status, result.latencyMs);
    if (result.truncated) return failed("ERROR", result.latencyMs, { input_truncated: true }); // padding attack: the tail was never seen [F26]
    const record: JudgeRecord = { ...base, status: "OK", latency_ms: Math.max(0, Math.round(result.latencyMs)), answers: toAnswers(result.answers) };
    return validateJudgeRecord(record).ok ? record : failed("ERROR", result.latencyMs);
  }

  return {
    provider: opts.provider,
    async assess(input: JudgeInput, ask: { timeoutMs: number; signal?: AbortSignal }): Promise<JudgeRecord> {
      const t0 = opts.timer();
      try {
        const result = await opts.client.ask({ state: judgeState(input), questions: JUDGE_QUESTIONS }, ask);
        return fromResult(result);
      } catch {
        // ChoiceClient never throws; if a custom one does, it is an ERROR like any other failure (I5).
        return failed("ERROR", opts.timer() - t0);
      }
    },
  };
}
