// Fetch-based client for the local Laya server (POST /v1/systemone, services/laya/FINDINGS.md). Loopback only: listing
// text never leaves this Mac. Each question goes out as one rotation per option order and the probabilities are averaged
// back into the caller's order, as the Laya README recommends (FINDINGS "Option order"). Any failure is a value, never a throw.
import type { Timer } from "../timer";
import {
  argmax,
  PROBABILITY_SUM_TOLERANCE,
  type AskOptions,
  type ChoiceAnswer,
  type ChoiceClient,
  type ChoiceMeta,
  type ChoiceQuestion,
  type ChoiceRequest,
  type ChoiceResult,
} from "./choice-client";

export const LAYA_MODEL = "typed-decisions";
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);

export interface LayaClientOptions {
  readonly baseUrl: string;
  readonly timer: Timer;
  readonly model?: string;
  readonly fetchFn?: typeof fetch;
  /** Send every option-order rotation (default true). */
  readonly rotations?: boolean;
  /** Checkpoint commit read from services/laya/MODEL_REVISION, reported in the meta of every answer. */
  readonly revision?: string | null;
}

/** Index order of rotation r over k options, as services/laya/smoke.mjs sends it. */
export const rotationOrder = (k: number, r: number): number[] => Array.from({ length: k }, (_, i) => (i + r) % k);

function wireQuestions(questions: readonly ChoiceQuestion[], rotations: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const q of questions) {
    const criteria = Object.fromEntries(q.options.map((o) => [o.label, o.description]));
    const k = q.options.length;
    if (!rotations) {
      out[q.id] = { type: "choice", instructions: q.instructions, criteria };
      continue;
    }
    for (let r = 0; r < k; r += 1) out[`${q.id}__r${r}`] = { type: "choice", instructions: q.instructions, criteria, option_order: rotationOrder(k, r) };
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Probabilities for exactly the labels of `q`, each a finite number in [0,1], summing to 1 within tolerance; else null. */
function readProbabilities(raw: unknown, q: ChoiceQuestion): Record<string, number> | null {
  if (!isRecord(raw) || !isRecord(raw["probabilities"])) return null;
  const p = raw["probabilities"];
  const values: Record<string, number> = {};
  for (const o of q.options) {
    const v = p[o.label];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) return null;
    values[o.label] = v;
  }
  const sum = Object.values(values).reduce((a, b) => a + b, 0);
  return Math.abs(sum - 1) <= PROBABILITY_SUM_TOLERANCE ? values : null;
}

function foldAnswers(answers: unknown, questions: readonly ChoiceQuestion[], rotations: boolean): Record<string, ChoiceAnswer> | string {
  if (!isRecord(answers)) return "response has no answers object";
  const folded: Record<string, ChoiceAnswer> = {};
  for (const q of questions) {
    const k = q.options.length;
    const ids = rotations ? Array.from({ length: k }, (_, r) => `${q.id}__r${r}`) : [q.id];
    const perRotation = ids.map((id) => readProbabilities(answers[id], q));
    if (perRotation.some((p) => p === null)) return `answer for ${q.id} is missing or malformed`;
    const rows = perRotation as Record<string, number>[];
    const mean = Object.fromEntries(q.options.map((o) => [o.label, rows.reduce((acc, row) => acc + (row[o.label] as number), 0) / rows.length]));
    folded[q.id] = { choice: argmax(mean), probabilities: mean };
  }
  return folded;
}

function isLoopback(baseUrl: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

export function createLayaClient(opts: LayaClientOptions): ChoiceClient {
  if (!isLoopback(opts.baseUrl)) throw new Error(`Laya client refuses a non-loopback address (${opts.baseUrl}): listing text must stay on this Mac`);
  const base = opts.baseUrl.replace(/\/$/, "");
  const model = opts.model ?? LAYA_MODEL;
  const rotations = opts.rotations ?? true;
  const doFetch = opts.fetchFn ?? fetch;
  const meta: ChoiceMeta = { model, revision: opts.revision ?? null };

  return {
    kind: "live",
    async ask(req: ChoiceRequest, ask: AskOptions): Promise<ChoiceResult> {
      const t0 = opts.timer();
      const failure = (status: "TIMEOUT" | "ERROR", reason: string): ChoiceResult => ({ ok: false, status, reason, latencyMs: opts.timer() - t0 });
      const timeout = AbortSignal.timeout(ask.timeoutMs);
      const signal = ask.signal === undefined ? timeout : AbortSignal.any([ask.signal, timeout]);
      try {
        const res = await doFetch(`${base}/v1/systemone`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, state: req.state, questions: wireQuestions(req.questions, rotations) }),
          signal,
        });
        if (!res.ok) return failure("ERROR", `HTTP ${res.status}`);
        const body: unknown = await res.json();
        if (!isRecord(body)) return failure("ERROR", "response is not a JSON object");
        const usage = body["usage"];
        if (!isRecord(usage) || typeof usage["truncated"] !== "boolean") return failure("ERROR", "response has no usage.truncated flag");
        const answers = foldAnswers(body["answers"], req.questions, rotations);
        if (typeof answers === "string") return failure("ERROR", answers);
        return { ok: true, answers, truncated: usage["truncated"], latencyMs: opts.timer() - t0, meta };
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        return failure(name === "TimeoutError" || name === "AbortError" ? "TIMEOUT" : "ERROR", err instanceof Error ? err.message : String(err));
      }
    },
  };
}
