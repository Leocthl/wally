// Builds the fit report (JSON shape) from case results. Pure: no I/O, no clock, no network.
// Every accuracy figure is MEASURED(n) on SIMULATED, single-annotator labels and is labelled that way.
import type { JudgeAnswers } from "@laisee/core/generated";
import { JUDGE_QUESTIONS, QUESTION_OPTIONS } from "../questions";
import { compareRuns, type QuestionComparison } from "./compare";
import { CORPUS_CATEGORIES, type CorpusLabels } from "./corpus";
import { GATES, stopsValue, type GateId } from "./gates";
import {
  SEARCH_GRID,
  calibration,
  distributionByLabel,
  operatingPoint,
  samplesFor,
  suggest,
  sweep,
  type CalibrationBin,
  type LabelDistribution,
  type OperatingPoint,
  type Suggestion,
} from "./metrics";
import { percentile, summarize, type Summary } from "./stats";
import { outcomeFor, suggestedThresholds, systemLevel, type Outcome, type SystemLevel } from "./system";
import type { GateThresholds } from "./thresholds";
import type { WindowingOptions } from "../windows";
import type { CaseResult } from "./types";
import { verdictsAt, type Verdicts } from "./verdicts";

export const REPORT_SCHEMA = "judge-fit/v1";
/** F38: at least 90 percent of legitimate scenarios approved, so at most this share may be blocked. */
export const LEGIT_APPROVED_MIN = 0.9;
export const FALSE_BLOCK_BUDGET = 1 - LEGIT_APPROVED_MIN;
/** Rows of the printed sweep table: every fifth point of the 0.01 search grid. */
const PRINT_EVERY = 5;

export interface AnchorResult {
  readonly name: string;
  readonly note: string;
  readonly status: CaseResult["status"];
  readonly inputTruncated: boolean;
  readonly live: JudgeAnswers | null;
  readonly recorded: JudgeAnswers | null;
}

export interface FitMeta {
  readonly date: string;
  readonly commit: { readonly hash: string; readonly dirty: boolean } | null;
  readonly server: { readonly baseUrl: string; readonly model: string; readonly revision: string | null; readonly device: string | null };
  readonly rotations: boolean;
  readonly timeoutMs: number;
}

export interface ReportInput {
  readonly meta: FitMeta;
  readonly thresholds: GateThresholds;
  readonly results: readonly CaseResult[];
  /** Same cases without option-order rotations; null when the comparison pass was skipped. */
  readonly canonical: readonly CaseResult[] | null;
  /** The long cases judged in windows; null when the pass was skipped. */
  readonly windowed: { readonly options: WindowingOptions; readonly results: readonly CaseResult[] } | null;
  readonly anchors: readonly AnchorResult[];
}

export interface GateReport {
  readonly id: GateId;
  readonly question: string;
  readonly rule: string;
  readonly thresholdName: keyof GateThresholds;
  readonly currentThreshold: number;
  readonly nShouldStop: number;
  readonly nShouldPass: number;
  /** Cases left out: failed calls and ambiguous labels. */
  readonly nExcluded: number;
  readonly distributions: readonly LabelDistribution[];
  readonly current: OperatingPoint;
  readonly sweep: readonly OperatingPoint[];
  readonly suggestion: Suggestion;
  readonly calibration: { readonly bins: readonly CalibrationBin[]; readonly ece: number | null };
}

export interface Miss {
  readonly gate: GateId;
  readonly id: string;
  readonly kind: "miss" | "false_block";
  readonly value: number;
}

export interface FailClosedRow {
  readonly id: string;
  readonly category: string;
  readonly status: CaseResult["status"];
  readonly inputTruncated: boolean;
  /** true when the label says this case should be stopped anyway. */
  readonly shouldStop: boolean;
}

export interface WindowRow {
  readonly id: string;
  readonly category: string;
  readonly textChars: number;
  readonly injectionLabel: string;
  readonly sellerLabel: string;
  readonly plain: { readonly status: CaseResult["status"]; readonly outcome: Outcome };
  readonly windowed: {
    readonly status: CaseResult["status"];
    readonly outcome: Outcome;
    readonly injectionRisk: number | null;
    readonly sellerRisk: number | null;
  };
}

export interface FitReport {
  readonly schema: typeof REPORT_SCHEMA;
  readonly provenance: "MEASURED(n) on SIMULATED inputs, single-annotator labels";
  readonly meta: FitMeta;
  readonly falseBlockBudget: number;
  readonly thresholds: GateThresholds;
  readonly corpus: {
    readonly n: number;
    readonly byCategory: Readonly<Record<string, number>>;
    readonly labels: Readonly<Record<string, Readonly<Record<string, number>>>>;
  };
  readonly run: {
    readonly statusCounts: Readonly<Record<CaseResult["status"], number>>;
    readonly truncated: number;
    readonly latencyOk: Summary | null;
    readonly latencyP95: number | null;
    readonly failClosed: readonly FailClosedRow[];
  };
  readonly gates: readonly GateReport[];
  /** What R10 would do with every case, under the current thresholds and under the per-gate suggestions. */
  readonly system: { readonly current: SystemLevel; readonly suggested: SystemLevel };
  readonly misses: readonly Miss[];
  readonly anchors: readonly (AnchorResult & { readonly liveVerdicts: Verdicts | null; readonly recordedVerdicts: Verdicts | null })[];
  readonly rotation: readonly QuestionComparison[] | null;
  /** Long listings judged whole (truncated, so ERROR) against judged in windows; null when the pass was skipped. */
  readonly windows: { readonly windowChars: number; readonly overlapChars: number; readonly maxWindows: number; readonly rows: readonly WindowRow[] } | null;
  readonly cases: readonly CaseResult[];
}

const count = <T extends string>(values: readonly T[]): Readonly<Record<string, number>> =>
  values.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});

function corpusSummary(results: readonly CaseResult[]): FitReport["corpus"] {
  const labelOf = (q: keyof CorpusLabels): readonly string[] => results.map((r) => r.labels[q]);
  return {
    n: results.length,
    byCategory: Object.fromEntries(CORPUS_CATEGORIES.map((c) => [c, results.filter((r) => r.category === c).length])),
    labels: Object.fromEntries(JUDGE_QUESTIONS.map((q) => [q, { ...Object.fromEntries(QUESTION_OPTIONS[q].map((l) => [l, 0])), ...count(labelOf(q)) }])),
  };
}

function runSummary(results: readonly CaseResult[]): FitReport["run"] {
  const ok = results.filter((r) => r.status === "OK");
  const latencies = ok.map((r) => r.latencyMs).sort((a, b) => a - b);
  return {
    statusCounts: { OK: ok.length, ERROR: results.filter((r) => r.status === "ERROR").length, TIMEOUT: results.filter((r) => r.status === "TIMEOUT").length },
    truncated: results.filter((r) => r.inputTruncated).length,
    latencyOk: summarize(latencies),
    latencyP95: latencies.length === 0 ? null : percentile(latencies, 95),
    failClosed: results
      .filter((r) => r.status !== "OK")
      .map((r) => ({ id: r.id, category: r.category, status: r.status, inputTruncated: r.inputTruncated, shouldStop: r.labels.escalate_or_proceed === "escalate" })),
  };
}

function gateReport(results: readonly CaseResult[], thresholds: GateThresholds, gate: (typeof GATES)[number]): GateReport {
  const samples = samplesFor(gate, results);
  const points = sweep(gate, samples);
  const currentThreshold = thresholds[gate.thresholdName];
  return {
    id: gate.id,
    question: gate.question,
    rule: gate.rule,
    thresholdName: gate.thresholdName,
    currentThreshold,
    nShouldStop: samples.filter((s) => s.positive).length,
    nShouldPass: samples.filter((s) => !s.positive).length,
    nExcluded: results.length - samples.length,
    distributions: distributionByLabel(gate, results),
    current: operatingPoint(gate, samples, currentThreshold),
    sweep: points.filter((p) => Math.round(p.t * 100) % PRINT_EVERY === 0),
    suggestion: suggest(gate, samples, points, FALSE_BLOCK_BUDGET),
    calibration: calibration(samples),
  };
}

function missesAt(results: readonly CaseResult[], thresholds: GateThresholds): readonly Miss[] {
  return GATES.flatMap((gate) =>
    samplesFor(gate, results).flatMap((s): Miss[] => {
      const stopped = stopsValue(gate, s.value, thresholds[gate.thresholdName]);
      if (s.positive && !stopped) return [{ gate: gate.id, id: s.id, kind: "miss", value: s.value }];
      if (!s.positive && stopped) return [{ gate: gate.id, id: s.id, kind: "false_block", value: s.value }];
      return [];
    }),
  );
}

function windowRows(plain: readonly CaseResult[], windowed: readonly CaseResult[], t: GateThresholds): readonly WindowRow[] {
  return windowed.flatMap((w) => {
    const p = plain.find((r) => r.id === w.id);
    if (p === undefined) return [];
    const risk = (r: CaseResult, pick: (a: NonNullable<CaseResult["answers"]>) => number): number | null => (r.answers === null ? null : pick(r.answers));
    return [
      {
        id: w.id,
        category: w.category,
        textChars: w.textChars,
        injectionLabel: w.labels.injection_risk,
        sellerLabel: w.labels.seller_risk,
        plain: { status: p.status, outcome: outcomeFor(p, t) },
        windowed: {
          status: w.status,
          outcome: outcomeFor(w, t),
          injectionRisk: risk(w, (a) => a.injection_risk.suspicious + a.injection_risk.injection),
          sellerRisk: risk(w, (a) => a.seller_risk.high_risk),
        },
      },
    ];
  });
}

export function buildReport(input: ReportInput): FitReport {
  const { results, thresholds } = input;
  const gates = GATES.map((gate) => gateReport(results, thresholds, gate));
  return {
    schema: REPORT_SCHEMA,
    provenance: "MEASURED(n) on SIMULATED inputs, single-annotator labels",
    meta: input.meta,
    falseBlockBudget: FALSE_BLOCK_BUDGET,
    thresholds,
    corpus: corpusSummary(results),
    run: runSummary(results),
    gates,
    system: { current: systemLevel(results, thresholds), suggested: systemLevel(results, suggestedThresholds(gates, thresholds)) },
    misses: missesAt(results, thresholds),
    anchors: input.anchors.map((a) => ({
      ...a,
      liveVerdicts: a.live === null ? null : verdictsAt(a.live, thresholds),
      recordedVerdicts: a.recorded === null ? null : verdictsAt(a.recorded, thresholds),
    })),
    rotation: input.canonical === null ? null : compareRuns(results, input.canonical),
    windows:
      input.windowed === null
        ? null
        : { windowChars: input.windowed.options.windowChars, overlapChars: input.windowed.options.overlapChars, maxWindows: input.windowed.options.maxWindows, rows: windowRows(results, input.windowed.results, thresholds) },
    cases: results,
  };
}

/** Points of the 0.01 grid, exported for the tests. */
export const PRINTED_GRID: readonly number[] = SEARCH_GRID.filter((t) => Math.round(t * 100) % PRINT_EVERY === 0);
