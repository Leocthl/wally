// Threshold-fit metrics over corpus results: confusion matrices at candidate thresholds, suggestions,
// calibration bins and per-label score distributions. Pure functions over CaseResult rows.
// Everything computed here is MEASURED(n) on SIMULATED, single-annotator labels: it is not an evaluation.
import { QUESTION_OPTIONS } from "../questions";
import type { GateSpec } from "./gates";
import { stopsValue } from "./gates";
import { mean, summarize, wilson, type Summary } from "./stats";
import type { CaseResult } from "./types";

export interface Sample {
  readonly id: string;
  /** true = the label says the gate should stop this case. */
  readonly positive: boolean;
  /** The probability the engine compares against its threshold. */
  readonly value: number;
  /** Higher is more dangerous (for calibration). */
  readonly risk: number;
  readonly label: string;
}

export interface Confusion {
  readonly tp: number;
  readonly fp: number;
  readonly fn: number;
  readonly tn: number;
}

export interface Interval {
  readonly low: number;
  readonly high: number;
}

export interface OperatingPoint {
  /** Threshold in the engine's units. */
  readonly t: number;
  readonly confusion: Confusion;
  readonly precision: number | null;
  readonly recall: number | null;
  /** Share of should-pass cases the gate stops. */
  readonly falseBlockRate: number | null;
  readonly recallCI: Interval | null;
  readonly falseBlockCI: Interval | null;
}

/** Tooling grid for the threshold search (0.01 steps), not a product threshold. */
export const SEARCH_GRID: readonly number[] = Array.from({ length: 99 }, (_, i) => (i + 1) / 100);
/** Equal-width bins of the risk score for the calibration table. Tooling choice. */
export const CALIBRATION_BINS = 5;

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

export function samplesFor(gate: GateSpec, results: readonly CaseResult[]): readonly Sample[] {
  return results.flatMap((r) => {
    if (r.status !== "OK" || r.answers === null) return [];
    const positive = gate.positive(r.labels);
    if (positive === null) return [];
    return [{ id: r.id, positive, value: gate.engineValue(r.answers), risk: gate.risk(r.answers), label: gate.labelOf(r.labels) }];
  });
}

export function operatingPoint(gate: GateSpec, samples: readonly Sample[], t: number): OperatingPoint {
  const count = (positive: boolean, stopped: boolean): number =>
    samples.filter((s) => s.positive === positive && stopsValue(gate, s.value, t) === stopped).length;
  const confusion: Confusion = { tp: count(true, true), fp: count(false, true), fn: count(true, false), tn: count(false, false) };
  const positives = confusion.tp + confusion.fn;
  const negatives = confusion.fp + confusion.tn;
  return {
    t,
    confusion,
    precision: ratio(confusion.tp, confusion.tp + confusion.fp),
    recall: ratio(confusion.tp, positives),
    falseBlockRate: ratio(confusion.fp, negatives),
    recallCI: wilson(confusion.tp, positives),
    falseBlockCI: wilson(confusion.fp, negatives),
  };
}

/** Operating points from the most relaxed threshold to the strictest, so recall never falls along the array. */
export function sweep(gate: GateSpec, samples: readonly Sample[], grid: readonly number[] = SEARCH_GRID): readonly OperatingPoint[] {
  const ordered = gate.stopsBelow ? [...grid].sort((a, b) => a - b) : [...grid].sort((a, b) => b - a);
  return ordered.map((t) => operatingPoint(gate, samples, t));
}

export type SuggestionKind = "separable_midpoint" | "budgeted_recall" | "max_youden" | "no_positives" | "no_negatives";

export interface Suggestion {
  readonly kind: SuggestionKind;
  readonly t: number | null;
  readonly point: OperatingPoint | null;
  readonly reason: string;
}

const NONE = (kind: SuggestionKind, reason: string): Suggestion => ({ kind, t: null, point: null, reason });

/** Midpoint of the gap between the classes, rounded as coarsely as still separates them; null if they overlap. */
function separatingThreshold(gate: GateSpec, samples: readonly Sample[]): number | null {
  const pos = samples.filter((s) => s.positive).map((s) => s.value);
  const neg = samples.filter((s) => !s.positive).map((s) => s.value);
  const [near, far] = gate.stopsBelow ? [Math.max(...pos), Math.min(...neg)] : [Math.max(...neg), Math.min(...pos)];
  if (!(near < far)) return null;
  const mid = (near + far) / 2;
  for (const decimals of [2, 3, 6]) {
    const t = Number(mid.toFixed(decimals));
    const p = operatingPoint(gate, samples, t);
    if (p.recall === 1 && p.falseBlockRate === 0) return t;
  }
  return null;
}

/** Index in the middle of the run of equally good points that contains the first best one. */
function plateauMiddle(scores: readonly number[], best: number): number {
  const same = (x: number): boolean => Math.abs(x - best) < 1e-12;
  const first = scores.findIndex(same);
  let last = first;
  while (last + 1 < scores.length && same(scores[last + 1] ?? Number.NaN)) last += 1;
  return Math.floor((first + last) / 2);
}

function pickBy(points: readonly OperatingPoint[], score: (p: OperatingPoint) => number): OperatingPoint | null {
  const scores = points.map(score);
  if (points.length === 0) return null;
  return points[plateauMiddle(scores, Math.max(...scores))] ?? null;
}

export function suggest(gate: GateSpec, samples: readonly Sample[], points: readonly OperatingPoint[], budget: number): Suggestion {
  if (!samples.some((s) => s.positive)) return NONE("no_positives", "the corpus has no case this gate should stop");
  if (!samples.some((s) => !s.positive)) return NONE("no_negatives", "the corpus has no case this gate should pass");
  const apart = separatingThreshold(gate, samples);
  if (apart !== null) {
    return {
      kind: "separable_midpoint",
      t: apart,
      point: operatingPoint(gate, samples, apart),
      reason: "every should-stop case scores on the stop side of every should-pass case; the midpoint of that gap",
    };
  }
  const usable = points.filter((p) => p.recall !== null && p.falseBlockRate !== null);
  const within = usable.filter((p) => (p.falseBlockRate ?? 1) <= budget);
  const budgeted = pickBy(within, (p) => p.recall ?? 0);
  if (budgeted !== null) {
    return { kind: "budgeted_recall", t: budgeted.t, point: budgeted, reason: "the classes overlap; highest recall whose false-block rate stays within the budget" };
  }
  const youden = pickBy(usable, (p) => (p.recall ?? 0) - (p.falseBlockRate ?? 0));
  return youden === null
    ? NONE("no_positives", "no usable operating point")
    : { kind: "max_youden", t: youden.t, point: youden, reason: "the classes overlap and no threshold fits the budget; best recall minus false-block rate" };
}

export interface CalibrationBin {
  readonly lo: number;
  readonly hi: number;
  readonly n: number;
  readonly meanRisk: number | null;
  readonly positiveRate: number | null;
}

export function calibration(samples: readonly Sample[], bins: number = CALIBRATION_BINS): { readonly bins: readonly CalibrationBin[]; readonly ece: number | null } {
  const slot = (risk: number): number => Math.min(bins - 1, Math.max(0, Math.floor(risk * bins)));
  const table = Array.from({ length: bins }, (_, i): CalibrationBin => {
    const inBin = samples.filter((s) => slot(s.risk) === i);
    return {
      lo: i / bins,
      hi: (i + 1) / bins,
      n: inBin.length,
      meanRisk: inBin.length === 0 ? null : mean(inBin.map((s) => s.risk)),
      positiveRate: ratio(inBin.filter((s) => s.positive).length, inBin.length),
    };
  });
  const ece =
    samples.length === 0
      ? null
      : table.reduce((sum, b) => (b.n === 0 ? sum : sum + (b.n / samples.length) * Math.abs((b.positiveRate ?? 0) - (b.meanRisk ?? 0))), 0);
  return { bins: table, ece };
}

export interface LabelDistribution {
  readonly label: string;
  readonly summary: Summary | null;
}

/** Risk score summary per label of the gate's question, in the question's own label order. */
export function distributionByLabel(gate: GateSpec, results: readonly CaseResult[]): readonly LabelDistribution[] {
  return QUESTION_OPTIONS[gate.question].map((label) => ({
    label,
    summary: summarize(
      results.flatMap((r) => (r.status === "OK" && r.answers !== null && gate.labelOf(r.labels) === label ? [gate.risk(r.answers)] : [])),
    ),
  }));
}
