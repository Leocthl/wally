// Where the judge's answers come from, stated in every result file: a live Laya on loopback, or recorded answers.
// The factory-level swap to SystemOneJudge (@laisee/agent/judge) happens in judgeFor; B0 keeps its own ChoiceClient.
import type { JudgePort } from "@laisee/core/ports";
import type { Scenario } from "../types";
import type { Timer } from "../timer";
import { TIMEOUTS_MS } from "../config";
import type { ChoiceClient } from "./choice-client";
import { createChoiceJudge } from "./choice-judge";
import { createLayaClient } from "./laya-client";
import { createRecordedClient, createRecordingClient, type Recording, type RecordingClient, type RecordingSource } from "./recording";
import { JUDGE_QUESTIONS } from "./questions";
import { createUnavailableClient } from "./unavailable";

export interface JudgeSourceInfo {
  readonly kind: "live" | "recorded";
  /** Provider label on the JudgeRecord: laya for live answers, replay for recorded ones. */
  readonly provider: "laya" | "replay";
  readonly model: string;
  readonly checkpointRevision: string | null;
  readonly baseUrl: string | null;
  readonly recordedFrom: RecordingSource | null;
}

export interface JudgeSource {
  readonly info: JudgeSourceInfo;
  judgeFor(scenario: Scenario): JudgePort;
  choiceFor(scenario: Scenario): ChoiceClient;
  /** true only when latency is a measurement of this run (live) [F26]. */
  readonly measureLatency: boolean;
  /** One call before the timed loop: the first request after a server start is slow [F26]. Excluded from every statistic. */
  warmUp(): Promise<void>;
  /** After the run: recorded-call statistics, or the recording a live run captured. */
  finish(source: RecordingSource): SourceOutcome;
}

export interface SourceOutcome {
  readonly recording: Recording | null;
  readonly replay: { readonly hits: number; readonly misses: number } | null;
}

function wrap(info: JudgeSourceInfo, client: ChoiceClient, timer: Timer, measureLatency: boolean, finish: JudgeSource["finish"], warmClient: ChoiceClient = client): JudgeSource {
  const down = createUnavailableClient();
  const version = info.kind === "live" ? `laya@${(info.checkpointRevision ?? "unknown").slice(0, 8)}` : `recorded@${(info.checkpointRevision ?? "unknown").slice(0, 8)}`;
  const clientFor = (s: Scenario): ChoiceClient => (s.events.judgeFault === "down" ? down : client);
  return {
    info,
    measureLatency,
    judgeFor: (s) => createChoiceJudge({ client: clientFor(s), timer, provider: info.provider, version }),
    choiceFor: clientFor,
    async warmUp() {
      if (info.kind !== "live") return;
      await warmClient.ask({ state: { mandate: "warm-up", listing: { title: "warm-up", description: "warm-up", price: "HK$1", seller: "warm-up", shipping: "free" } }, questions: JUDGE_QUESTIONS }, { timeoutMs: TIMEOUTS_MS.judge * 20 });
    },
    finish,
  };
}

export interface LiveOptions {
  readonly baseUrl: string;
  readonly timer: Timer;
  readonly revision: string | null;
  /** Capture every model call so the run can be replayed later. */
  readonly record: boolean;
  readonly fetchFn?: typeof fetch;
}

export function createLiveSource(opts: LiveOptions): JudgeSource {
  const live = createLayaClient({ baseUrl: opts.baseUrl, timer: opts.timer, revision: opts.revision, ...(opts.fetchFn === undefined ? {} : { fetchFn: opts.fetchFn }) });
  const recording: RecordingClient | null = opts.record ? createRecordingClient(live) : null;
  const info: JudgeSourceInfo = { kind: "live", provider: "laya", model: "typed-decisions", checkpointRevision: opts.revision, baseUrl: opts.baseUrl, recordedFrom: null };
  return wrap(info, recording ?? live, opts.timer, true, (source) => ({ recording: recording === null ? null : recording.snapshot(source), replay: null }), live);
}

export function createRecordedSource(recording: Recording, timer: Timer): JudgeSource {
  const client = createRecordedClient(recording);
  const info: JudgeSourceInfo = { kind: "recorded", provider: "replay", model: recording.source.model, checkpointRevision: recording.source.revision, baseUrl: null, recordedFrom: recording.source };
  return wrap(info, client, timer, false, () => ({ recording: null, replay: client.stats() }));
}

/** Wraps any client (a test double, say) as a source of the given kind. */
export function createClientSource(client: ChoiceClient, kind: JudgeSourceInfo["kind"], timer: Timer): JudgeSource {
  const info: JudgeSourceInfo = { kind, provider: kind === "live" ? "laya" : "replay", model: "typed-decisions", checkpointRevision: null, baseUrl: null, recordedFrom: null };
  return wrap(info, client, timer, kind === "live", () => ({ recording: null, replay: null }));
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
