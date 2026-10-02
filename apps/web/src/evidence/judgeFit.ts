// Judge-fit reports (data/results/judge-fit-*.json), normalised so the panel reads one shape for schema v1 (one fit on
// all cases) and v2 (tuning split, one held-out evaluation, all wording variants). Every count stays k and n; rates and
// intervals are computed on the page, never copied from the file.
import type { FileChip } from "./chip";
import { asArr, asInt, asNum, asObj, asStr } from "./read";

export type FitSchema = "judge-fit/v1" | "judge-fit/v2";

export interface Count {
  readonly k: number;
  readonly n: number;
}

export interface Approvals {
  readonly legit: Count;
  readonly injected: Count;
  readonly highRisk: Count | null;
  readonly outOfScope: Count | null;
}

export interface GateFit {
  readonly id: string;
  readonly threshold: number | null;
  /** Should-stop cases the gate stopped. */
  readonly recall: Count;
  /** Should-pass cases the gate stopped. */
  readonly falseBlock: Count;
}

/** One set of thresholds and what it did end to end on the evaluated cases. */
export interface ThresholdRun {
  readonly thresholds: Readonly<Record<string, number>>;
  readonly approvals: Approvals;
  readonly gates: readonly GateFit[];
}

export interface Variant {
  readonly id: string;
  readonly idea: string;
  readonly rank: number | null;
  readonly okCalls: Count | null;
  readonly meanAuc: number | null;
  readonly approvals: Approvals | null;
  readonly chosen: boolean;
}

export interface DemoListing {
  readonly name: string;
  readonly note: string;
  readonly status: string;
  /** v2: the R10 outcome on the live call and on the recorded fixture. */
  readonly liveOutcome: string | null;
  readonly recordedOutcome: string | null;
  /** v1: per-question verdicts. */
  readonly live: Readonly<Record<string, string>>;
  readonly recorded: Readonly<Record<string, string>>;
}

export interface JudgeFit {
  readonly file: string;
  readonly schema: FitSchema;
  readonly date: string;
  readonly commit: string | null;
  /** Chip for the evaluated figures: the whole corpus (v1) or the held-out split (v2). */
  readonly chip: FileChip;
  /** v2: chip for figures from the tuning split (variants, fitted thresholds). */
  readonly tuningChip: FileChip | null;
  readonly split: { readonly tuningN: number; readonly heldoutN: number; readonly rule: string } | null;
  /** At the thresholds the report proposes (v2) or that were in force (v1). */
  readonly evaluated: ThresholdRun;
  /** v2: the register v0 thresholds on the same held-out cases. */
  readonly baseline: ThresholdRun | null;
  /** Thresholds the report kept at their register value instead of fitting (v2: T_esc when its AUC was too low). */
  readonly unfitted: readonly string[];
  readonly fileSaysF38Met: boolean | null;
  readonly listings: readonly DemoListing[];
  readonly variants: readonly Variant[];
  readonly latency: { readonly n: number; readonly p50: number; readonly p95: number; readonly max: number | null; readonly chip: FileChip } | null;
  readonly failedCalls: number | null;
  readonly limits: readonly string[];
}

/** Which threshold each gate reads (the report's gate rules, mirrored here; v1 files name it themselves). */
export const GATE_THRESHOLD: Readonly<Record<string, string>> = {
  scope_fit: "T_scope",
  injection_risk: "T_inj",
  seller_escalate: "T_sell_esc",
  seller_deny: "T_sell_deny",
  escalate_or_proceed: "T_esc",
};

export const strings = (x: unknown): readonly string[] => (asArr(x) ?? []).flatMap((s) => (typeof s === "string" ? [s] : []));
export const words = (x: unknown): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(asObj(x) ?? {}).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
export const numbers = (x: unknown): Readonly<Record<string, number>> =>
  Object.fromEntries(Object.entries(asObj(x) ?? {}).flatMap(([k, v]) => (asNum(v) === null ? [] : [[k, v as number]])));

/** {k, n} with integers 0 <= k <= n; anything else is null (no denominator, no figure). */
export function readCount(x: unknown): Count | null {
  const o = asObj(x);
  const k = asInt(o?.["k"]);
  const n = asInt(o?.["n"]);
  return k !== null && n !== null && k <= n ? { k, n } : null;
}

export function count(k: number | null, n: number | null): Count | null {
  return k !== null && n !== null && k <= n ? { k, n } : null;
}

export function fitChip(n: number, what: string, date: string, commit: string | null): FileChip {
  return { kind: "MEASURED", text: `MEASURED(n=${n}${what ? ` ${what}` : ""}, ${date}${commit ? `, commit=${commit.slice(0, 7)}` : ""})` };
}

export function readListing(x: unknown): DemoListing | null {
  const o = asObj(x);
  const name = asStr(o?.["name"]);
  if (o === null || name === null) return null;
  return {
    name,
    note: asStr(o["note"]) ?? "",
    status: asStr(o["status"]) ?? "",
    liveOutcome: asStr(o["liveOutcome"]),
    recordedOutcome: asStr(o["recordedOutcome"]),
    live: words(o["liveVerdicts"]),
    recorded: words(o["recordedVerdicts"]),
  };
}
