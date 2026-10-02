// SystemOneJudge: JudgePort for the typed-decision wire protocol shared by local Laya (default) and hosted
// Jev (optional). One request carries the four typed questions as k option-order rotations; the answers are
// averaged back into canonical order. One attempt, no retries, a deadline from the caller (F34). Any failure,
// timeout, malformed answer or truncated input comes back as a TIMEOUT or ERROR record, which R10 escalates (I5).
import type { JudgeProvider } from "@laisee/core/generated";
import type { JudgeInput, JudgeRecord } from "@laisee/core/ports";
import {
  DEFAULT_LAYA_MODEL,
  HEALTH_PATH,
  MAX_RESPONSE_BYTES,
  MAX_STATE_CHARS,
  UNKNOWN_VERSION,
  VERSION_PREFIX_CHARS,
} from "./config";
import { createDeadline, type Deadline } from "./deadline";
import { emitDiagnostic, type DiagnosticReason, type DiagnosticSink } from "./diagnostics";
import { errorMessage, isRecord } from "./guards";
import { sendRequest, type FetchLike } from "./http";
import { planRows } from "./plan";
import { failureRecord, okRecord, type RecordBase } from "./record";
import { buildJudgeState } from "./state";
import { callFailure, callSystemOne, type CallContext, type CallFailure, type CallOutcome } from "./system-one-call";
import type { ParsedResponse } from "./parse";
import type { JudgeQuestionDefs } from "./questions";
import type { WarmUpOptions, WarmUpResult, WarmableJudge } from "./warm-up";
import { combineWindowAnswers, splitListing, type WindowPlan, type WindowingOptions } from "./windows";

export interface SystemOneJudgeOptions {
  readonly provider: "laya" | "jev";
  /** No trailing path: the adapter appends /v1/systemone (and /health for laya). */
  readonly baseUrl: string;
  readonly model: string;
  /** Sent as `Authorization: Bearer <key>`. Never logged, never recorded. */
  readonly apiKey?: string | undefined;
  /** Default true: send k option-order rotations per question and average them (Laya README recipe). */
  readonly rotations?: boolean | undefined;
  /**
   * Stretch, off by default: split a listing longer than one row into overlapping windows, judge each and merge
   * conservatively (windows.ts). Without it a listing that overflows the row is an ERROR with input_truncated.
   */
  readonly windowing?: WindowingOptions | false | undefined;
  /** Question wording. Default: the shipped JUDGE_QUESTION_DEFS. The judge:tune experiment passes its variants. */
  readonly questions?: JudgeQuestionDefs | undefined;
  readonly fetchImpl?: FetchLike | undefined;
  readonly onDiagnostic?: DiagnosticSink | undefined;
  /** Monotonic milliseconds; tests may inject. Default performance.now. */
  readonly clock?: (() => number) | undefined;
}

const usableTimeout = (ms: number): boolean => Number.isFinite(ms) && ms > 0;

export class SystemOneJudge implements WarmableJudge {
  readonly provider: JudgeProvider;
  readonly #options: SystemOneJudgeOptions;
  readonly #fetch: FetchLike;
  readonly #clock: () => number;
  /** Checkpoint commit from /health (laya). Cached once known. */
  #checkpoint: string | null = null;

  constructor(options: SystemOneJudgeOptions) {
    this.provider = options.provider;
    this.#options = options;
    this.#fetch = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.#clock = options.clock ?? (() => performance.now());
  }

  async assess(input: JudgeInput, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<JudgeRecord> {
    const started = this.#clock();
    const elapsed = (): number => this.#clock() - started;
    let deadline: Deadline | null = null;
    try {
      if (!usableTimeout(opts.timeoutMs)) return this.#finish(callFailure("TIMEOUT", "invalid_timeout", "timeoutMs is not a positive number"), elapsed(), null);
      if (opts.signal?.aborted === true) return this.#finish(callFailure("TIMEOUT", "aborted", "the caller had already aborted"), elapsed(), null);
      deadline = createDeadline(opts.timeoutMs, opts.signal);
      const outcome = await this.#run(input, deadline);
      return this.#finish(outcome.call, elapsed(), outcome.version);
    } catch (err) {
      return this.#finish(callFailure("ERROR", "internal", errorMessage(err).slice(0, 200)), elapsed(), null);
    } finally {
      deadline?.dispose();
    }
  }

  /**
   * One full-size request on a throwaway state, to load the model and learn the checkpoint version before the
   * first real decision. Never throws; the answers are discarded.
   */
  async warmUp(opts: WarmUpOptions): Promise<WarmUpResult> {
    const started = this.#clock();
    const elapsed = (): number => Math.max(0, Math.round(this.#clock() - started));
    if (!usableTimeout(opts.timeoutMs) || opts.signal?.aborted === true) return { ok: false, latencyMs: elapsed() };
    const deadline = createDeadline(opts.timeoutMs, opts.signal);
    try {
      const lookup = this.#lookupCheckpoint(deadline);
      const call = await callSystemOne(this.#context(deadline), {
        mandate: "warm up",
        rules: "categories: apparel",
        cart: "1 x warm up",
        scameter: "no record found",
        listing: { title: "warm up", description: "warm up" },
      });
      await lookup;
      return { ok: call.ok, latencyMs: elapsed() };
    } catch {
      return { ok: false, latencyMs: elapsed() };
    } finally {
      deadline.dispose();
    }
  }

  #context(deadline: Deadline): CallContext {
    return {
      fetchImpl: this.#fetch,
      baseUrl: this.#options.baseUrl,
      model: this.#options.model,
      headers: this.#headers(),
      rows: planRows(this.#options.rotations ?? true),
      questions: this.#options.questions,
      // Without a usage block nobody can tell whether the input was truncated: ERROR for every provider (I5).
      requireUsage: true,
      deadline,
    };
  }

  async #run(input: JudgeInput, deadline: Deadline): Promise<{ call: CallOutcome; version: string | null }> {
    const windowing = this.#options.windowing;
    const plan: WindowPlan =
      windowing === undefined || windowing === false
        ? { ok: true, parts: [{ text: input.listingText, index: 0, total: 1 }] }
        : splitListing(input.listingText, windowing);
    if (!plan.ok) return { call: callFailure("ERROR", "input_too_large", "the listing needs more windows than allowed", { inputTruncated: true }), version: null };
    const checkpointLookup = this.#lookupCheckpoint(deadline);
    const ctx = this.#context(deadline);
    const parsed: ParsedResponse[] = [];
    for (const part of plan.parts) {
      const state = buildJudgeState(input, part);
      if (JSON.stringify(state).length > MAX_STATE_CHARS) {
        return { call: callFailure("ERROR", "input_too_large", "state is larger than the server accepts", { inputTruncated: true }), version: null };
      }
      const call = await callSystemOne(ctx, state);
      if (!call.ok) return { call, version: null };
      parsed.push(call.parsed);
    }
    const [first] = parsed;
    if (first === undefined) return { call: callFailure("ERROR", "internal", "no window was judged"), version: null };
    const answers = parsed.length === 1 ? first.answers : combineWindowAnswers(parsed.map((p) => p.answers));
    return { call: { ok: true, parsed: { ...first, answers } }, version: await checkpointLookup };
  }

  #headers(): Readonly<Record<string, string>> {
    const base = { "content-type": "application/json", accept: "application/json" };
    const key = this.#options.apiKey;
    return key !== undefined && key.length > 0 ? { ...base, authorization: `Bearer ${key}` } : base;
  }

  /** Laya names its checkpoint commit only in /health. Failures leave the version unknown; they never fail the call. */
  async #lookupCheckpoint(deadline: Deadline): Promise<string | null> {
    if (this.provider !== "laya") return null;
    if (this.#checkpoint !== null) return this.#checkpoint;
    const url = `${this.#options.baseUrl.replace(/\/+$/, "")}${HEALTH_PATH}`;
    const res = await sendRequest(this.#fetch, url, { method: "GET", headers: this.#headers() }, deadline.signal, MAX_RESPONSE_BYTES);
    if (res.kind !== "response" || res.status !== 200) return null;
    try {
      const health: unknown = JSON.parse(res.text);
      const revisions = isRecord(health) ? health["revisions"] : undefined;
      const commit = isRecord(revisions) ? revisions[this.#options.model] : undefined;
      if (typeof commit === "string" && commit.length > 0) this.#checkpoint = commit.slice(0, VERSION_PREFIX_CHARS);
    } catch {
      // not JSON: leave the version unknown
    }
    return this.#checkpoint;
  }

  #finish(outcome: CallOutcome, latencyMs: number, checkpoint: string | null): JudgeRecord {
    const base = this.#recordBase(outcome, latencyMs, checkpoint);
    if (outcome.ok) {
      this.#emit("OK", "ok", "answered", latencyMs);
      return okRecord(base, outcome.parsed.answers);
    }
    this.#emit(outcome.status, outcome.reason, outcome.detail, latencyMs, outcome);
    return failureRecord(base, outcome.status, outcome.inputTruncated);
  }

  #recordBase(outcome: CallOutcome, latencyMs: number, checkpoint: string | null): RecordBase {
    const parsed = outcome.ok ? outcome.parsed : null;
    const configured = this.#options.model.length > 0 ? this.#options.model : DEFAULT_LAYA_MODEL;
    const hosted = parsed?.model ?? configured;
    const model = this.provider === "jev" ? hosted : (parsed?.routingModel ?? configured);
    const version = this.provider === "jev" ? (parsed?.model ?? UNKNOWN_VERSION) : (checkpoint ?? this.#checkpoint ?? UNKNOWN_VERSION);
    return { provider: this.provider, model, version, latencyMs, shadow: false };
  }

  #emit(status: "OK" | "TIMEOUT" | "ERROR", reason: DiagnosticReason, detail: string, latencyMs: number, failure?: CallFailure): void {
    const diagnostic = { provider: this.provider, status, reason, detail, latencyMs: Math.round(latencyMs) };
    emitDiagnostic(this.#options.onDiagnostic, failure?.httpStatus === undefined ? diagnostic : { ...diagnostic, httpStatus: failure.httpStatus });
  }
}
