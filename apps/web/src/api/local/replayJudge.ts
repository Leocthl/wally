// The replay judge for on-device mode: recorded answers keyed by the SHA-256 of the listing text, provider replay,
// version recorded@..., latency = the lookup time (a replay is not a measurement of the model). A line-by-line port of
// @wally/agent's ReplayJudge, which hashes with node:crypto and so cannot run in a browser bundle (Vite turns node:*
// into an empty module). A test pins it to ReplayJudge on every recording. Text with no recording is an ERROR record:
// R10 then escalates (R10.unavailable, I5); nothing is ever guessed. Never throws.
import type { ReplayRecording } from "@wally/agent/judge";
import { sha256Hex } from "@wally/core/crypto";
import type { JudgeAnswers, JudgeProvider } from "@wally/core/generated";
import type { JudgeInput, JudgePort, JudgeRecord } from "@wally/core/ports";
import { validateJudgeRecord } from "@wally/core/schema";

export interface LocalReplayJudgeOptions {
  readonly recordings: readonly ReplayRecording[];
  readonly clock?: () => number;
}

interface RecordBase {
  readonly model: string;
  readonly version: string;
  readonly latencyMs: number;
}

const PROVIDER: JudgeProvider = "replay";
const MISSING = { model: "replay", version: "recorded@none" } as const;
/** Same label as the judge package when a name is empty (judge/config.ts UNKNOWN_VERSION). */
const UNKNOWN = "unknown";

function toRecordBase(base: RecordBase): Omit<JudgeRecord, "status"> {
  return {
    provider: PROVIDER,
    model: base.model.length > 0 ? base.model : UNKNOWN,
    version: base.version.length > 0 ? base.version : UNKNOWN,
    latency_ms: Math.max(0, Math.round(base.latencyMs)),
    shadow: false,
  };
}

const failureRecord = (base: RecordBase, status: "TIMEOUT" | "ERROR"): JudgeRecord => ({ ...toRecordBase(base), status });

function okRecord(base: RecordBase, answers: JudgeAnswers): JudgeRecord {
  const record: JudgeRecord = { ...toRecordBase(base), status: "OK", answers };
  return validateJudgeRecord(record).ok ? record : failureRecord(base, "ERROR");
}

export class LocalReplayJudge implements JudgePort {
  readonly provider: JudgeProvider = PROVIDER;
  readonly #byFingerprint: ReadonlyMap<string, ReplayRecording>;
  readonly #clock: () => number;

  constructor(options: LocalReplayJudgeOptions) {
    this.#byFingerprint = new Map(options.recordings.map((r) => [r.fingerprint, r]));
    this.#clock = options.clock ?? (() => performance.now());
  }

  async assess(input: JudgeInput, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<JudgeRecord> {
    const started = this.#clock();
    const missing = (): RecordBase => ({ ...MISSING, latencyMs: this.#clock() - started });
    try {
      if (!(Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0) || opts.signal?.aborted === true) return failureRecord(missing(), "TIMEOUT");
      const hit = this.#byFingerprint.get(sha256Hex(input.listingText));
      if (hit === undefined || hit.record.answers === undefined) return failureRecord(missing(), "ERROR");
      const { model, version } = hit.record;
      return okRecord({ model, version, latencyMs: this.#clock() - started }, structuredClone(hit.record.answers));
    } catch {
      return failureRecord(missing(), "ERROR");
    }
  }
}
