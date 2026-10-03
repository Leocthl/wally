// Warm-up: the first call after a Laya restart took 2,568 ms [F26], which is over the judge timeout (F34),
// so the first demo decision would TIMEOUT and ESCALATE. Call warmUp once at start, before anyone is watching.
import type { JudgePort } from "@wally/core/ports";

export interface WarmUpResult {
  /** true when the server answered a full-size request. */
  readonly ok: boolean;
  /** MEASURED wall time of the warm-up call. */
  readonly latencyMs: number;
}

export interface WarmUpOptions {
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface WarmableJudge extends JudgePort {
  warmUp(opts: WarmUpOptions): Promise<WarmUpResult>;
}

export function isWarmable(judge: JudgePort): judge is WarmableJudge {
  return typeof (judge as Partial<WarmableJudge>).warmUp === "function";
}
