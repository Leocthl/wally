// Small local client for the Laya server (POST /v1/systemone, wire format in services/laya/FINDINGS.md).
// One typed choice per call, option-order rotations averaged back into the caller's order. Loopback only
// (the shopper request must not leave the machine). Every failure is a value, never a throw (I5).
import { LAYA_MODEL, PlannerConfigError } from "./config";

export interface ChoiceSpec {
  /** Question id, lower case words with underscores; rotations are sent as `<id>__r<n>`. */
  readonly id: string;
  readonly instructions: string;
  /** label -> description. Semantic labels only (no yes/no/true/false). */
  readonly criteria: Readonly<Record<string, string>>;
  readonly state: unknown;
}

export interface ChoiceOutcome {
  /** Mean over all rotations, one entry per label, rounded to 4 decimals. */
  readonly probabilities: Readonly<Record<string, number>>;
  readonly choice: string;
  /** Top probability minus the second. */
  readonly margin: number;
  readonly latencyMs: number;
}

export type LayaResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

export interface LayaClient {
  choose(spec: ChoiceSpec, timeoutMs: number): Promise<LayaResult<ChoiceOutcome>>;
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);
/** Laya rounds probabilities to 4 decimals, so a sum this far from 1 is a malformed answer. */
const SUM_TOLERANCE = 0.01;
const PRECISION = 10_000;

const fail = (reason: string): { readonly ok: false; readonly reason: string } => ({ ok: false, reason });

export function createLayaClient(options: { readonly baseUrl: string }): LayaClient {
  const endpoint = systemOneUrl(options.baseUrl);
  return { choose: (spec, timeoutMs) => choose(endpoint, spec, timeoutMs) };
}

function systemOneUrl(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new PlannerConfigError(`Laya url is not a valid url: ${baseUrl}`);
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname) || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    throw new PlannerConfigError(`The planner talks to a loopback Laya server only (127.0.0.1, localhost or ::1), got ${parsed.hostname}`);
  }
  return `${parsed.origin}/v1/systemone`;
}

const rotationOrder = (k: number, r: number): readonly number[] => Array.from({ length: k }, (_, i) => (i + r) % k);
const rotationId = (id: string, r: number): string => `${id}__r${r}`;

function buildBody(spec: ChoiceSpec, labels: readonly string[]): string {
  const questions = Object.fromEntries(
    labels.map((_, r) => [
      rotationId(spec.id, r),
      { type: "choice", instructions: spec.instructions, criteria: spec.criteria, option_order: rotationOrder(labels.length, r) },
    ]),
  );
  return JSON.stringify({ model: LAYA_MODEL, state: spec.state, questions });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRotation(answers: Record<string, unknown>, id: string, labels: readonly string[]): LayaResult<readonly number[]> {
  const answer = answers[id];
  const probs = isRecord(answer) ? answer["probabilities"] : undefined;
  if (!isRecord(probs)) return fail(`missing answer for ${id}`);
  const extra = Object.keys(probs).find((l) => !labels.includes(l));
  if (extra !== undefined) return fail(`unexpected label ${extra} in ${id}`);
  const numbers: number[] = [];
  for (const label of labels) {
    const value = probs[label];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return fail(`missing or invalid label ${label} in ${id}`);
    numbers.push(value);
  }
  if (Math.abs(numbers.reduce((a, c) => a + c, 0) - 1) > SUM_TOLERANCE) return fail(`probabilities in ${id} do not sum to one`);
  return { ok: true, value: numbers };
}

function readTruncation(json: Record<string, unknown>): string | null {
  const usage = json["usage"];
  if (!isRecord(usage)) return "missing usage";
  const flagged = usage["truncated"] !== false || (Array.isArray(usage["truncated_questions"]) && usage["truncated_questions"].length > 0);
  return flagged ? "Laya truncated the input" : null;
}

function summarise(labels: readonly string[], rotations: readonly (readonly number[])[], latencyMs: number): ChoiceOutcome {
  const mean = labels.map((_, i) => Math.round((rotations.reduce((a, r) => a + (r[i] ?? 0), 0) / rotations.length) * PRECISION) / PRECISION);
  const ranked = mean.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p || a.i - b.i);
  const top = ranked[0];
  const second = ranked[1];
  const choice = labels[top?.i ?? 0] ?? "";
  return {
    probabilities: Object.fromEntries(labels.map((l, i) => [l, mean[i] ?? 0])),
    choice,
    margin: Math.round(((top?.p ?? 0) - (second?.p ?? 0)) * PRECISION) / PRECISION,
    latencyMs,
  };
}

function parseResponse(text: string, spec: ChoiceSpec, labels: readonly string[], latencyMs: number): LayaResult<ChoiceOutcome> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("response is not valid JSON");
  }
  if (!isRecord(json) || !isRecord(json["answers"])) return fail("response has no answers object");
  const answers = json["answers"];
  const rotations = labels.map((_, r) => readRotation(answers, rotationId(spec.id, r), labels));
  const bad = rotations.find((r) => !r.ok);
  if (bad !== undefined && !bad.ok) return fail(bad.reason);
  const truncated = readTruncation(json);
  if (truncated !== null) return fail(truncated);
  return { ok: true, value: summarise(labels, rotations.flatMap((r) => (r.ok ? [r.value] : [])), latencyMs) };
}

async function choose(endpoint: string, spec: ChoiceSpec, timeoutMs: number): Promise<LayaResult<ChoiceOutcome>> {
  const labels = Object.keys(spec.criteria);
  if (labels.length < 2) return fail("a choice needs at least two options");
  const wholeMs = Math.floor(timeoutMs); // AbortSignal.timeout takes whole milliseconds
  if (!Number.isFinite(timeoutMs) || wholeMs < 1) return fail("timeout: no time left for a Laya call");
  const started = performance.now();
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: buildBody(spec, labels),
      signal: AbortSignal.timeout(wholeMs),
    });
    const text = await res.text();
    if (!res.ok) return fail(`Laya answered HTTP ${res.status}`);
    return parseResponse(text, spec, labels, Math.round(performance.now() - started));
  } catch (err) {
    return fail(`Laya request failed: ${err instanceof Error ? `${err.name}: ${err.message}` : "unknown error"}`);
  }
}
