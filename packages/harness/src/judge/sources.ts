// Where the judge's answers come from, stated in every result file: a live Laya on loopback, or recorded answers.
// The judge itself (SystemOneJudge) and B0's client are injected by factory.ts; this file only wires recording and replay
// around them and never names a concrete implementation.
import type { JudgePort } from "@wally/core/ports";
import type { Scenario } from "../types";
import type { ChoiceClient } from "./choice-client";
import { createRecorder, createReplayer, type Recording, type RecordingSource, type ReplayStats } from "./recording";
import { createUnavailableClient, createUnavailableJudge } from "./unavailable";

export interface JudgeSourceInfo {
  readonly kind: "live" | "recorded";
  /** Provider label on the JudgeRecord: laya for live answers, replay for recorded ones. */
  readonly provider: "laya" | "replay";
  readonly model: string;
  readonly checkpointRevision: string | null;
  readonly baseUrl: string | null;
  readonly recordedFrom: RecordingSource | null;
  /** true for a source built from test doubles (createClientSource): never product evidence. */
  readonly testDouble?: true;
}

export interface JudgeSource {
  readonly info: JudgeSourceInfo;
  judgeFor(scenario: Scenario): JudgePort;
  choiceFor(scenario: Scenario): ChoiceClient;
  /** true only when latency is a measurement of this run (live) [F26]. */
  readonly measureLatency: boolean;
  /** One call before the timed loop: the first request after a server start is slow [F26]. Excluded from every statistic. */
  warmUp(): Promise<void>;
  /** After the run: replay statistics, or the recording a live run captured. */
  finish(source: RecordingSource): SourceOutcome;
}

export interface SourceOutcome {
  readonly recording: Recording | null;
  readonly replay: ReplayStats | null;
}

interface Parts {
  readonly info: JudgeSourceInfo;
  readonly judge: JudgePort;
  readonly client: ChoiceClient;
  readonly measureLatency: boolean;
  readonly warmUp: () => Promise<void>;
  readonly finish: JudgeSource["finish"];
}

/** judge_down scenarios get a judge and a client that are down, whatever the source. */
function assemble(parts: Parts): JudgeSource {
  const downJudge = createUnavailableJudge(parts.info.provider);
  const downClient = createUnavailableClient();
  const down = (s: Scenario): boolean => s.events.judgeFault === "down";
  return {
    info: parts.info,
    measureLatency: parts.measureLatency,
    judgeFor: (s) => (down(s) ? downJudge : parts.judge),
    choiceFor: (s) => (down(s) ? downClient : parts.client),
    warmUp: parts.warmUp,
    finish: parts.finish,
  };
}

export interface LiveOptions {
  /** The product judge (SystemOneJudge on loopback Laya). */
  readonly judge: JudgePort;
  /** B0's own client for the same server. */
  readonly client: ChoiceClient;
  readonly warmUp: () => Promise<void>;
  readonly baseUrl: string;
  readonly revision: string | null;
  /** Capture every model call so the run can be replayed later. */
  readonly record: boolean;
  /** Label for a recording made while the judge wording is still being tuned. */
  readonly provisional?: string;
}

export function createLiveSource(opts: LiveOptions): JudgeSource {
  const recorder = opts.record ? createRecorder() : null;
  const info: JudgeSourceInfo = { kind: "live", provider: "laya", model: "typed-decisions", checkpointRevision: opts.revision, baseUrl: opts.baseUrl, recordedFrom: null };
  return assemble({
    info,
    judge: recorder === null ? opts.judge : recorder.judge(opts.judge),
    client: recorder === null ? opts.client : recorder.client(opts.client),
    measureLatency: true,
    warmUp: opts.warmUp,
    finish: (source) => ({
      recording: recorder === null ? null : recorder.snapshot({ ...source, ...(opts.provisional === undefined ? {} : { provisional: opts.provisional }) }),
      replay: null,
    }),
  });
}

export function createRecordedSource(recording: Recording): JudgeSource {
  const replayer = createReplayer(recording);
  const info: JudgeSourceInfo = { kind: "recorded", provider: "replay", model: recording.source.model, checkpointRevision: recording.source.revision, baseUrl: null, recordedFrom: recording.source };
  return assemble({
    info,
    judge: replayer.judge(),
    client: replayer.client(),
    measureLatency: false,
    warmUp: async () => undefined,
    finish: () => ({ recording: null, replay: replayer.stats() }),
  });
}

/** Wraps a judge and a client (test doubles, say) as a source of the given kind. */
export function createClientSource(parts: { readonly judge: JudgePort; readonly client: ChoiceClient; readonly kind: JudgeSourceInfo["kind"] }): JudgeSource {
  const info: JudgeSourceInfo = {
    kind: parts.kind,
    provider: parts.kind === "live" ? "laya" : "replay",
    model: "typed-decisions",
    checkpointRevision: null,
    baseUrl: null,
    recordedFrom: null,
    testDouble: true,
  };
  return assemble({ info, judge: parts.judge, client: parts.client, measureLatency: parts.kind === "live", warmUp: async () => undefined, finish: () => ({ recording: null, replay: null }) });
}

export interface LayaHealth {
  readonly device: string | null;
  readonly revision: string | null;
}

/** GET /health. null = unreachable: live tests and runs skip themselves, they never start or stop the server. */
export async function probeLaya(baseUrl: string, fetchFn: typeof fetch = fetch, timeoutMs = 1_500): Promise<LayaHealth | null> {
  try {
    const res = await fetchFn(`${baseUrl.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = (await res.json()) as { status?: unknown; device?: unknown; revisions?: Record<string, unknown> };
    if (body.status !== "ok") return null;
    const revision = body.revisions?.["typed-decisions"];
    return { device: typeof body.device === "string" ? body.device : null, revision: typeof revision === "string" ? revision : null };
  } catch {
    return null;
  }
}
