// Builders for RuleResult (decision.schema.json $defs.RuleResult). Fixed key order, so identical
// inputs give byte-identical decisions. comparator states the pass condition, also on a FAIL.
import type { RuleId, RuleResult, TemplateId } from "../generated";

export type { RuleResult } from "../generated";

export type Comparator = NonNullable<RuleResult["comparator"]>;
export type RuleVerdict = NonNullable<RuleResult["verdict"]>;
export type RuleInputs = Readonly<Record<string, unknown>>;

export interface RuleSpec {
  readonly id: RuleId;
  readonly check?: string;
  readonly inputs: RuleInputs;
  readonly comparator: Comparator;
  readonly thresholdRef?: string;
}

function head(id: RuleId, check: string | undefined): Pick<RuleResult, "id" | "check"> {
  return check === undefined ? { id } : { id, check };
}

function tail(comparator: Comparator, thresholdRef: string | undefined): Pick<RuleResult, "comparator" | "threshold_ref"> {
  return thresholdRef === undefined ? { comparator } : { comparator, threshold_ref: thresholdRef };
}

export function passed(spec: RuleSpec): RuleResult {
  return { ...head(spec.id, spec.check), result: "PASS", inputs: { ...spec.inputs }, ...tail(spec.comparator, spec.thresholdRef) };
}

export function failed(spec: RuleSpec, verdict: RuleVerdict, templateId: TemplateId): RuleResult {
  return {
    ...head(spec.id, spec.check),
    result: "FAIL",
    verdict,
    inputs: { ...spec.inputs },
    ...tail(spec.comparator, spec.thresholdRef),
    template_id: templateId,
  };
}

export function skipped(id: RuleId, inputs: RuleInputs = {}, check?: string): RuleResult {
  return { ...head(id, check), result: "SKIPPED", inputs: { ...inputs } };
}

/** PASS when ok, else FAIL with the verdict and template. */
export function judged(ok: boolean, spec: RuleSpec, verdict: RuleVerdict, templateId: TemplateId): RuleResult {
  return ok ? passed(spec) : failed(spec, verdict, templateId);
}

/** ms since epoch for an RFC 3339 timestamp, or null when it does not parse. */
export function parseTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** ms since epoch for a Date, or null for an invalid Date or a non-Date. */
export function timeOf(now: unknown): number | null {
  if (!(now instanceof Date)) return null;
  const ms = now.getTime();
  return Number.isFinite(ms) ? ms : null;
}

export const isMoney = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Milliseconds per second (unit conversion). */
export const MS_PER_S = 1_000;
