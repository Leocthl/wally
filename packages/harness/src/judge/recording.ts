// Recorded answers. A live run can record every model call it makes; a recorded run replays them. Two kinds of call are
// recorded: B0's ChoiceClient requests (answers or failures) and B2's judge calls (the JudgeRecord SystemOneJudge returned).
// Both are keyed by a hash of exactly what was asked and by how many times that request was already made, so identical
// requests that got different answers live (a TIMEOUT under load, say) replay in the same order and the replay reproduces
// the run. An input the recording has never seen returns ERROR (fail closed) and is counted, so an incomplete recording shows.
import type { JudgeInput, JudgePort, JudgeRecord } from "@laisee/core/ports";
import { sha256Hex, stableStringify } from "../canonical";
import type { AskOptions, ChoiceAnswer, ChoiceClient, ChoiceMeta, ChoiceRequest, ChoiceResult } from "./choice-client";

export const RECORDING_SCHEMA = "laisee.harness.recording/v2";

export interface RecordedAnswer {
  readonly answers: Readonly<Record<string, ChoiceAnswer>>;
  readonly truncated: boolean;
  /** Wall time of the original live call. Reported as RECORDED, never as a measurement of the replay. */
  readonly latencyMs: number;
}

export interface RecordedFailure {
  readonly status: "TIMEOUT" | "ERROR";
  readonly reason: string;
}

export interface RecordingSource {
  readonly model: string;
  readonly revision: string | null;
  readonly device: string | null;
  readonly recordedAt: string;
  readonly commit: string;
  readonly seed: number;
  readonly n: number;
  /** Set when the recording was made while the judge wording was still being tuned: it must not be quoted as final. */
  readonly provisional?: string;
}

export interface Recording {
  readonly schema: typeof RECORDING_SCHEMA;
  readonly provenance: "RECORDED";
  readonly source: RecordingSource;
  /** B0's model calls. */
  readonly answers: Readonly<Record<string, RecordedAnswer>>;
  readonly failures: Readonly<Record<string, RecordedFailure>>;
  /** B2's judge calls, as the adapter returned them. */
  readonly judge: Readonly<Record<string, JudgeRecord>>;
}

/** Hash of exactly what the model is shown: the state and the questions. */
export function requestKey(req: ChoiceRequest): string {
  return sha256Hex(stableStringify({ state: req.state, questions: req.questions }));
}

/** Hash of exactly what the judge is given. */
export function judgeKey(input: JudgeInput): string {
  return sha256Hex(stableStringify(input));
}

/** Key of the nth time (from 0) the same request was made in one run. */
export const callKey = (requestHash: string, nth: number): string => `${requestHash}.${nth}`;

const CALL_KEY = /^[0-9a-f]{64}\.\d+$/;

/** Counts calls per request without mutating shared state: each call returns the next count and the updated table. */
function nextCall(counts: Readonly<Record<string, number>>, hash: string): { readonly key: string; readonly counts: Readonly<Record<string, number>> } {
  const nth = counts[hash] ?? 0;
  return { key: callKey(hash, nth), counts: { ...counts, [hash]: nth + 1 } };
}

export interface Recorder {
  client(inner: ChoiceClient): ChoiceClient;
  judge(inner: JudgePort): JudgePort;
  snapshot(source: RecordingSource): Recording;
}

/** Wraps live clients and judges and keeps every answer and failure they produce. Copy-on-write, so snapshots never alias. */
export function createRecorder(): Recorder {
  let answers: Readonly<Record<string, RecordedAnswer>> = {};
  let failures: Readonly<Record<string, RecordedFailure>> = {};
  let judge: Readonly<Record<string, JudgeRecord>> = {};
  let clientCounts: Readonly<Record<string, number>> = {};
  let judgeCounts: Readonly<Record<string, number>> = {};
  return {
    client(inner) {
      return {
        kind: inner.kind,
        async ask(req: ChoiceRequest, opts: AskOptions): Promise<ChoiceResult> {
          const next = nextCall(clientCounts, requestKey(req));
          clientCounts = next.counts;
          const result = await inner.ask(req, opts);
          if (result.ok) answers = { ...answers, [next.key]: { answers: result.answers, truncated: result.truncated, latencyMs: result.latencyMs } };
          else failures = { ...failures, [next.key]: { status: result.status, reason: result.reason } };
          return result;
        },
      };
    },
    judge(inner) {
      return {
        provider: inner.provider,
        async assess(input, opts): Promise<JudgeRecord> {
          const next = nextCall(judgeCounts, judgeKey(input));
          judgeCounts = next.counts;
          const record = await inner.assess(input, opts);
          judge = { ...judge, [next.key]: record };
          return record;
        },
      };
    },
    snapshot: (source) => ({ schema: RECORDING_SCHEMA, provenance: "RECORDED", source, answers, failures, judge }),
  };
}

export interface ReplayStats {
  /** Inputs answered from a recorded answer. */
  readonly hits: number;
  /** Inputs answered from a recorded failure (TIMEOUT or ERROR): replayed as the same failure, which is a recording too. */
  readonly recordedFailures: number;
  /** Inputs the recording never saw: answered ERROR, and the run is not complete. */
  readonly misses: number;
}

export interface Replayer {
  client(): ChoiceClient;
  judge(): JudgePort;
  stats(): ReplayStats;
}

const MISSING_JUDGE: JudgeRecord = { provider: "replay", model: "replay", version: "recorded@none", status: "ERROR", latency_ms: 0, shadow: false };

export function createReplayer(recording: Recording): Replayer {
  let stats: ReplayStats = { hits: 0, recordedFailures: 0, misses: 0 };
  let clientCounts: Readonly<Record<string, number>> = {};
  let judgeCounts: Readonly<Record<string, number>> = {};
  const count = (which: keyof ReplayStats): void => {
    stats = { ...stats, [which]: stats[which] + 1 };
  };
  const meta: ChoiceMeta = { model: recording.source.model, revision: recording.source.revision };
  return {
    client() {
      return {
        kind: "recorded",
        async ask(req: ChoiceRequest): Promise<ChoiceResult> {
          const next = nextCall(clientCounts, requestKey(req));
          clientCounts = next.counts;
          const hit = recording.answers[next.key];
          if (hit !== undefined) {
            count("hits");
            return { ok: true, answers: hit.answers, truncated: hit.truncated, latencyMs: hit.latencyMs, meta };
          }
          const failed = recording.failures[next.key];
          if (failed !== undefined) {
            count("recordedFailures");
            return { ok: false, status: failed.status, reason: `recorded failure: ${failed.reason}`, latencyMs: 0 };
          }
          count("misses");
          return { ok: false, status: "ERROR", reason: "no recording for this input", latencyMs: 0 };
        },
      };
    },
    judge() {
      return {
        provider: "replay",
        async assess(input): Promise<JudgeRecord> {
          const next = nextCall(judgeCounts, judgeKey(input));
          judgeCounts = next.counts;
          const hit = recording.judge[next.key];
          if (hit === undefined) {
            count("misses");
            return MISSING_JUDGE;
          }
          count(hit.status === "OK" ? "hits" : "recordedFailures");
          return { ...structuredClone(hit), provider: "replay" };
        },
      };
    },
    stats: () => stats,
  };
}

const isRecordLike = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Validates a parsed recording file at the boundary. Anything unexpected is rejected rather than half-trusted. */
export function parseRecording(raw: unknown): Recording {
  if (!isRecordLike(raw) || raw["schema"] !== RECORDING_SCHEMA || raw["provenance"] !== "RECORDED") throw new Error("not a harness recording (schema or provenance mismatch)");
  const source = raw["source"];
  if (!isRecordLike(source) || typeof source["model"] !== "string" || typeof source["commit"] !== "string") throw new Error("recording has no source block");
  if (!isRecordLike(raw["answers"]) || !isRecordLike(raw["failures"]) || !isRecordLike(raw["judge"])) throw new Error("recording has no answers, failures or judge table");
  for (const [key, entry] of Object.entries(raw["answers"])) {
    if (!CALL_KEY.test(key) || !isRecordLike(entry) || !isRecordLike(entry["answers"]) || typeof entry["truncated"] !== "boolean" || typeof entry["latencyMs"] !== "number") {
      throw new Error(`recording entry ${key.slice(0, 12)} is malformed`);
    }
  }
  for (const [key, entry] of Object.entries(raw["judge"])) {
    if (!CALL_KEY.test(key) || !isRecordLike(entry) || typeof entry["status"] !== "string" || typeof entry["latency_ms"] !== "number") {
      throw new Error(`recording judge entry ${key.slice(0, 12)} is malformed`);
    }
  }
  // The checks above cover every field a replay reads; the engine re-validates each judge record before it counts on it.
  return raw as unknown as Recording;
}
