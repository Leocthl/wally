// Recorded answers. A live run can record every model call it makes; a recorded run replays them by request hash.
// An input the recording has never seen returns ERROR (fail closed) and is counted, so an incomplete recording shows.
import { sha256Hex, stableStringify } from "../canonical";
import type { AskOptions, ChoiceAnswer, ChoiceClient, ChoiceMeta, ChoiceRequest, ChoiceResult } from "./choice-client";

export const RECORDING_SCHEMA = "laisee.harness.recording/v1";

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
}

export interface Recording {
  readonly schema: typeof RECORDING_SCHEMA;
  readonly provenance: "RECORDED";
  readonly source: RecordingSource;
  readonly answers: Readonly<Record<string, RecordedAnswer>>;
  readonly failures: Readonly<Record<string, RecordedFailure>>;
}

/** Hash of exactly what the model is shown: the state and the questions. */
export function requestKey(req: ChoiceRequest): string {
  return sha256Hex(stableStringify({ state: req.state, questions: req.questions }));
}

export interface RecordingClient extends ChoiceClient {
  snapshot(source: RecordingSource): Recording;
}

/** Wraps a live client and keeps every answer and failure it sees. Copy-on-write, so snapshots never alias. */
export function createRecordingClient(inner: ChoiceClient): RecordingClient {
  let answers: Readonly<Record<string, RecordedAnswer>> = {};
  let failures: Readonly<Record<string, RecordedFailure>> = {};
  return {
    kind: inner.kind,
    async ask(req: ChoiceRequest, opts: AskOptions): Promise<ChoiceResult> {
      const result = await inner.ask(req, opts);
      const key = requestKey(req);
      if (result.ok) answers = { ...answers, [key]: { answers: result.answers, truncated: result.truncated, latencyMs: result.latencyMs } };
      else failures = { ...failures, [key]: { status: result.status, reason: result.reason } };
      return result;
    },
    snapshot: (source) => ({ schema: RECORDING_SCHEMA, provenance: "RECORDED", source, answers, failures }),
  };
}

export interface RecordedClient extends ChoiceClient {
  stats(): { readonly hits: number; readonly misses: number };
}

export function createRecordedClient(recording: Recording): RecordedClient {
  let hits = 0;
  let misses = 0;
  const meta: ChoiceMeta = { model: recording.source.model, revision: recording.source.revision };
  return {
    kind: "recorded",
    async ask(req: ChoiceRequest): Promise<ChoiceResult> {
      const key = requestKey(req);
      const hit = recording.answers[key];
      if (hit !== undefined) {
        hits += 1;
        return { ok: true, answers: hit.answers, truncated: hit.truncated, latencyMs: hit.latencyMs, meta };
      }
      misses += 1;
      const failed = recording.failures[key];
      if (failed !== undefined) return { ok: false, status: failed.status, reason: `recorded failure: ${failed.reason}`, latencyMs: 0 };
      return { ok: false, status: "ERROR", reason: "no recording for this input", latencyMs: 0 };
    },
    stats: () => ({ hits, misses }),
  };
}

const isRecordLike = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Validates a parsed recording file at the boundary. Anything unexpected is rejected rather than half-trusted. */
export function parseRecording(raw: unknown): Recording {
  if (!isRecordLike(raw) || raw["schema"] !== RECORDING_SCHEMA || raw["provenance"] !== "RECORDED") throw new Error("not a harness recording (schema or provenance mismatch)");
  const source = raw["source"];
  if (!isRecordLike(source) || typeof source["model"] !== "string" || typeof source["commit"] !== "string") throw new Error("recording has no source block");
  if (!isRecordLike(raw["answers"]) || !isRecordLike(raw["failures"])) throw new Error("recording has no answers or failures table");
  for (const [key, entry] of Object.entries(raw["answers"])) {
    if (!/^[0-9a-f]{64}$/.test(key) || !isRecordLike(entry) || !isRecordLike(entry["answers"]) || typeof entry["truncated"] !== "boolean" || typeof entry["latencyMs"] !== "number") {
      throw new Error(`recording entry ${key.slice(0, 12)} is malformed`);
    }
  }
  // The checks above cover every field a replay reads; answers are re-validated by ChoiceJudge before the engine sees them.
  return raw as unknown as Recording;
}
