import type { JudgeAnswers, JudgeProvider } from "../generated";
import type { JudgeInput, JudgePort, JudgeRecord } from "../ports";

/** Low-risk answers: every question well inside the F36/F50 thresholds. */
export const CLEAN_ANSWERS: JudgeAnswers = {
  scope_fit: { in_scope: 0.95, out_of_scope: 0.05 },
  injection_risk: { clean: 0.97, suspicious: 0.02, injection: 0.01 },
  seller_risk: { low_risk: 0.95, high_risk: 0.05 },
  escalate_or_proceed: { proceed: 0.9, escalate: 0.1 },
};

export interface FakeJudgeResponse {
  readonly status?: JudgeRecord["status"];
  readonly answers?: Partial<JudgeAnswers>;
  readonly latencyMs?: number;
  /** Simulates Laya usage.truncated: status ERROR with input_truncated true. */
  readonly inputTruncated?: boolean;
}

export interface FakeJudgeOptions extends FakeJudgeResponse {
  readonly provider?: JudgeProvider;
  readonly model?: string;
  readonly version?: string;
  readonly shadow?: boolean;
  readonly fallbackFrom?: "laya" | "jev";
  /** Per-call answers, e.g. by listing text; overrides the static fields above. */
  readonly respond?: (input: JudgeInput) => FakeJudgeResponse;
}

/** Configurable JudgePort. Never throws; an aborted signal gives status TIMEOUT. */
export class FakeJudge implements JudgePort {
  readonly provider: JudgeProvider;
  readonly #options: FakeJudgeOptions;
  #calls: readonly JudgeInput[] = [];

  constructor(options: FakeJudgeOptions = {}) {
    this.provider = options.provider ?? "laya";
    this.#options = options;
  }

  get calls(): readonly JudgeInput[] {
    return this.#calls;
  }

  async assess(input: JudgeInput, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<JudgeRecord> {
    this.#calls = [...this.#calls, input];
    const response = { ...this.#options, ...(this.#options.respond?.(input) ?? {}) };
    const truncated = response.inputTruncated === true;
    const status = opts.signal?.aborted ? "TIMEOUT" : truncated ? "ERROR" : (response.status ?? "OK");
    const base: JudgeRecord = {
      provider: this.provider,
      model: this.#options.model ?? (this.provider === "jev" ? "jev-fake" : "typed-decisions"),
      version: this.#options.version ?? "fake",
      status,
      latency_ms: Math.min(response.latencyMs ?? 5, opts.timeoutMs),
      shadow: this.#options.shadow ?? false,
    };
    const flagged = truncated ? { ...base, input_truncated: true } : base;
    const withFallback = this.#options.fallbackFrom ? { ...flagged, fallback_from: this.#options.fallbackFrom } : flagged;
    return status === "OK" ? { ...withFallback, answers: { ...CLEAN_ANSWERS, ...response.answers } } : withFallback;
  }
}
