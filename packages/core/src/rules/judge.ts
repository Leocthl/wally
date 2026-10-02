// R10 judge thresholds, typed profile [F36, F50]. The judge enters the decision only here and can
// only add DENY or ESCALATE (I3). Any record the engine cannot read (status not OK, input_truncated,
// unknown provider, malformed probabilities) => ESCALATE R10.unavailable (I5); there is no fallback model.
// Each metric takes the tighter of P(x) and 1 - P(not x), which agree when options sum to 1 (F36 "i.e.").
import { THRESHOLD_REFS, type EngineConfig } from "../config";
import type { Mandate } from "../generated";
import { failed, judged, skipped, type RuleResult } from "./result";

const QUESTIONS = {
  scope_fit: ["in_scope", "out_of_scope"],
  injection_risk: ["clean", "suspicious", "injection"],
  seller_risk: ["low_risk", "high_risk"],
  escalate_or_proceed: ["proceed", "escalate"],
} as const;

type Question = keyof typeof QUESTIONS;
type Answers = { readonly [Q in Question]: Readonly<Record<(typeof QUESTIONS)[Q][number], number>> };

const KNOWN_PROVIDERS: ReadonlySet<unknown> = new Set(["laya", "jev", "replay"]);
const KNOWN_STATUS: ReadonlySet<unknown> = new Set(["OK", "TIMEOUT", "ERROR"]);

type Reading =
  | { readonly usable: true; readonly answers: Answers }
  | { readonly usable: false; readonly problem: string; readonly status: string | null; readonly truncated: boolean; readonly provider: string | null };

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> => v !== null && typeof v === "object" && !Array.isArray(v);
const isProbability = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

function readBlock(raw: unknown, options: readonly string[]): Readonly<Record<string, number>> | null {
  if (!isRecord(raw)) return null;
  const entries = options.map((o) => [o, raw[o]] as const);
  return entries.every(([, p]) => isProbability(p)) ? (Object.fromEntries(entries) as Record<string, number>) : null;
}

function readAnswers(raw: unknown): Answers | null {
  const blocks = (Object.keys(QUESTIONS) as Question[]).map((q) => [q, readBlock(isRecord(raw) ? raw[q] : undefined, QUESTIONS[q])] as const);
  return blocks.every(([, b]) => b !== null) ? (Object.fromEntries(blocks) as unknown as Answers) : null;
}

function readJudge(judge: unknown): Reading {
  const rec = isRecord(judge) ? judge : {};
  const status = typeof rec["status"] === "string" ? rec["status"] : null;
  const provider = typeof rec["provider"] === "string" ? rec["provider"] : null;
  const flag = rec["input_truncated"];
  const truncated = flag === true;
  const unusable = (problem: string): Reading => ({ usable: false, problem, status, truncated, provider });
  if (!isRecord(judge)) return unusable("not_a_record");
  if (flag !== undefined && typeof flag !== "boolean") return unusable("malformed_truncation_flag");
  if (!KNOWN_STATUS.has(status)) return unusable("unknown_status");
  if (status !== "OK") return unusable("status");
  if (truncated) return unusable("input_truncated");
  if (!KNOWN_PROVIDERS.has(provider)) return unusable("unknown_provider");
  const answers = readAnswers(rec["answers"]);
  return answers === null ? unusable("malformed_answers") : { usable: true, answers };
}

function scopeFit(a: Answers, t: EngineConfig["judge"], categories: readonly string[]): RuleResult {
  const { in_scope, out_of_scope } = a.scope_fit;
  const p = Math.min(in_scope, 1 - out_of_scope);
  const inputs = { p_in_scope: p, threshold: t.t_scope, in_scope, out_of_scope, categories };
  const spec = { id: "R10" as const, check: "scope_fit", inputs, comparator: ">=" as const, thresholdRef: THRESHOLD_REFS.t_scope };
  return judged(p >= t.t_scope, spec, "ESCALATE", "R10.scope");
}

function injectionRisk(a: Answers, t: EngineConfig["judge"]): RuleResult {
  const { clean, suspicious, injection } = a.injection_risk;
  const p = Math.max(suspicious + injection, 1 - clean);
  const inputs = { p_injection_risk: p, threshold: t.t_inj, clean, suspicious, injection };
  const spec = { id: "R10" as const, check: "injection_risk", inputs, comparator: "<" as const, thresholdRef: THRESHOLD_REFS.t_inj };
  return judged(p < t.t_inj, spec, "DENY", "R10.injection");
}

function sellerRisk(a: Answers, t: EngineConfig["judge"]): RuleResult {
  const { low_risk, high_risk } = a.seller_risk;
  const p = Math.max(high_risk, 1 - low_risk);
  const base = { p_high_risk: p, low_risk, high_risk, threshold_deny: t.t_sell_deny, threshold_escalate: t.t_sell_esc };
  if (p >= t.t_sell_deny) {
    const spec = { id: "R10" as const, check: "seller_risk", inputs: { ...base, threshold: t.t_sell_deny }, comparator: "<" as const, thresholdRef: THRESHOLD_REFS.t_sell_deny };
    return failed(spec, "DENY", "R10.seller_risk");
  }
  const spec = { id: "R10" as const, check: "seller_risk", inputs: { ...base, threshold: t.t_sell_esc }, comparator: "<" as const, thresholdRef: THRESHOLD_REFS.t_sell_esc };
  return judged(p < t.t_sell_esc, spec, "ESCALATE", "R10.seller_risk");
}

function escalateOrProceed(a: Answers, t: EngineConfig["judge"]): RuleResult {
  const { proceed, escalate } = a.escalate_or_proceed;
  const p = Math.max(escalate, 1 - proceed);
  const inputs = { p_escalate: p, threshold: t.t_esc, proceed, escalate };
  const spec = { id: "R10" as const, check: "escalate_or_proceed", inputs, comparator: "<" as const, thresholdRef: THRESHOLD_REFS.t_esc };
  return judged(p < t.t_esc, spec, "ESCALATE", "R10.escalate");
}

function unavailable(reading: Extract<Reading, { usable: false }>): RuleResult {
  const inputs = { status: reading.status, input_truncated: reading.truncated, problem: reading.problem, provider: reading.provider };
  return failed({ id: "R10", check: "judge_status", inputs, comparator: "==" }, "ESCALATE", "R10.unavailable");
}

/** Shadow mode (JUDGE_MODE=shadow): recorded as SKIPPED with the verdict it would have given. */
function toShadow(r: RuleResult): RuleResult {
  const verdict = r.result === "FAIL" ? (r.verdict ?? "ESCALATE") : "PASS";
  const template = r.template_id === undefined ? {} : { shadow_template_id: r.template_id };
  return skipped("R10", { ...r.inputs, shadow: true, shadow_verdict: verdict, ...template }, r.check);
}

export interface R10Input {
  readonly mandate: Mandate;
  /** The judge record as received; not trusted to be well formed. */
  readonly judge: unknown;
  readonly config: EngineConfig;
}

/** R10: one result per judge question, or one R10.unavailable result when the record is unusable. */
export function evaluateR10({ mandate, judge, config }: R10Input): RuleResult[] {
  const reading = readJudge(judge);
  const t = config.judge;
  const results = reading.usable
    ? [scopeFit(reading.answers, t, mandate.rules.categories), injectionRisk(reading.answers, t), sellerRisk(reading.answers, t), escalateOrProceed(reading.answers, t)]
    : [unavailable(reading)];
  const shadow = isRecord(judge) && judge["shadow"] === true;
  return shadow ? results.map(toShadow) : results;
}
