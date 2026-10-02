// ShadowJudge (JUDGE_MODE=shadow): runs the real judge and marks its record shadow = true, so the engine
// logs the verdict without letting it change the decision. It never loosens anything (I3) and never throws (I5).
import type { JudgeProvider } from "@laisee/core/generated";
import type { JudgeInput, JudgePort, JudgeRecord } from "@laisee/core/ports";
import { errorMessage } from "./guards";
import { failureRecord } from "./record";

export class ShadowJudge implements JudgePort {
  readonly provider: JudgeProvider;
  readonly #inner: JudgePort;

  constructor(inner: JudgePort) {
    this.#inner = inner;
    this.provider = inner.provider;
  }

  async assess(input: JudgeInput, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<JudgeRecord> {
    const started = performance.now();
    try {
      return { ...(await this.#inner.assess(input, opts)), shadow: true };
    } catch (err) {
      // The inner judge broke the never-throw contract. Report it as an error record instead of propagating.
      const detail = errorMessage(err).slice(0, 80);
      return failureRecord({ provider: this.provider, model: "unknown", version: detail, latencyMs: performance.now() - started, shadow: true }, "ERROR");
    }
  }
}
