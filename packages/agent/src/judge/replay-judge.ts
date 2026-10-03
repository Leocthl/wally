// ReplayJudge (provider replay): returns recorded answers keyed by the SHA-256 of the listing text, status OK.
// Used by CI and as the deliberate booth fallback. It is labelled in every record: provider replay, version
// `recorded@...`, and a latency that is the lookup time, because a replay is not a measurement of the model.
// A listing with no recording is an ERROR (R10 escalates it); nothing is ever guessed.
import { createHash } from "node:crypto";
import type { JudgeProvider } from "@wally/core/generated";
import type { JudgeInput, JudgePort, JudgeRecord } from "@wally/core/ports";
import { emitDiagnostic, type DiagnosticSink } from "./diagnostics";
import { errorMessage } from "./guards";
import { failureRecord, okRecord } from "./record";
import type { ReplayRecording } from "./replay-recordings";

export interface ReplayJudgeOptions {
  readonly recordings: readonly ReplayRecording[];
  readonly onDiagnostic?: DiagnosticSink | undefined;
  readonly clock?: (() => number) | undefined;
}

const MISSING = { model: "replay", version: "recorded@none" } as const;

export class ReplayJudge implements JudgePort {
  readonly provider: JudgeProvider = "replay";
  readonly #byFingerprint: ReadonlyMap<string, ReplayRecording>;
  readonly #sink: DiagnosticSink | undefined;
  readonly #clock: () => number;

  constructor(options: ReplayJudgeOptions) {
    this.#byFingerprint = new Map(options.recordings.map((r) => [r.fingerprint, r]));
    this.#sink = options.onDiagnostic;
    this.#clock = options.clock ?? (() => performance.now());
  }

  async assess(input: JudgeInput, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<JudgeRecord> {
    const started = this.#clock();
    const latency = (): number => this.#clock() - started;
    const base = { provider: this.provider, shadow: false, ...MISSING };
    try {
      if (!(Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0) || opts.signal?.aborted === true) {
        return this.#report(failureRecord({ ...base, latencyMs: latency() }, "TIMEOUT"), "aborted", "no time to answer");
      }
      const hit = this.#byFingerprint.get(createHash("sha256").update(input.listingText, "utf8").digest("hex"));
      if (hit === undefined || hit.record.answers === undefined) {
        return this.#report(failureRecord({ ...base, latencyMs: latency() }, "ERROR"), "no_recording", "no recording for this listing text");
      }
      const { model, version } = hit.record;
      return this.#report(okRecord({ ...base, model, version, latencyMs: latency() }, structuredClone(hit.record.answers)), "ok", hit.source);
    } catch (err) {
      return this.#report(failureRecord({ ...base, latencyMs: latency() }, "ERROR"), "internal", errorMessage(err).slice(0, 200));
    }
  }

  #report(record: JudgeRecord, reason: "ok" | "aborted" | "no_recording" | "internal", detail: string): JudgeRecord {
    emitDiagnostic(this.#sink, { provider: this.provider, status: record.status, reason, detail, latencyMs: record.latency_ms });
    return record;
  }
}
