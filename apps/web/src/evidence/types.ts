// What the Evidence screen reads from data/results (schema laisee.harness.result/v1, judge-fit/v1) after the guards.
// Every rate stays k and n with the file's own chip; optional parts are null when the file does not carry them.
import type { FileChip } from "./chip";

export const BASELINES = ["B0", "B1", "B2"] as const;
export type BaselineId = (typeof BASELINES)[number];

export interface Rate {
  readonly k: number;
  readonly n: number;
  readonly chip: FileChip;
}

export type Latency =
  | { readonly measured: true; readonly n: number; readonly p50: number; readonly p95: number; readonly chip: FileChip; readonly scope: string | null }
  | { readonly measured: false; readonly note: string; readonly chip: FileChip };

export interface BaselineData {
  readonly scenarios: number | null;
  /** Every k/n metric the file carries for this baseline, by its own key (overspend_rate, false_block_rate, ...). */
  readonly rates: Readonly<Record<string, Rate>>;
  readonly latency: Latency | null;
}

export interface ComponentInfo {
  readonly key: string;
  readonly name: string;
  /** null when the file does not say. */
  readonly real: boolean | null;
  readonly note: string;
}

export interface AcceptanceRow {
  readonly id: string;
  readonly target: string;
  readonly evaluatedOn: string;
  readonly result: Rate;
  readonly pass: boolean;
}

export interface CategoryCell {
  readonly scenarios: number;
  readonly legitimate: number;
  readonly completed: Rate | null;
  readonly falseBlock: Rate | null;
  readonly stopBreach: Rate | null;
}

export interface CategoryRow {
  readonly category: string;
  readonly cells: Readonly<Partial<Record<BaselineId, CategoryCell>>>;
}

export interface BlockedScenario {
  readonly id: string;
  readonly category: string;
  readonly variant: string;
  readonly decision: string;
  readonly rule: string | null;
  readonly expected: string;
  readonly error: string | null;
}

export interface JudgeFalseAllow {
  readonly falseAllow: Rate | null;
  readonly tuning: Rate | null;
  readonly heldout: Rate | null;
  readonly atMirror: { readonly falseAllow: Rate | null; readonly tuning: Rate | null; readonly heldout: Rate | null } | null;
  readonly notEvaluated: number | null;
  readonly unavailable: number | null;
}

export interface InjectionCorpus {
  readonly items: number | null;
  readonly falseAllow: Rate | null;
  readonly tuning: Rate | null;
  readonly heldout: Rate | null;
  readonly benignFlagged: Rate | null;
}

export interface HarnessRun {
  readonly file: string;
  readonly mode: "live" | "recorded";
  readonly label: string | null;
  readonly provenance: string | null;
  readonly runAt: string;
  readonly runAtMs: number;
  readonly seed: number | null;
  readonly commit: string | null;
  readonly dirty: boolean | null;
  readonly components: readonly ComponentInfo[] | null;
  readonly evidence: { readonly valid: boolean; readonly reasons: readonly string[] } | null;
  readonly baselines: Readonly<Partial<Record<BaselineId, BaselineData>>>;
  readonly descriptions: Readonly<Partial<Record<BaselineId, string>>>;
  readonly definitions: Readonly<Record<string, string>>;
  readonly judgeFalseAllow: JudgeFalseAllow | null;
  readonly injectionCorpus: InjectionCorpus | null;
  readonly categories: readonly CategoryRow[] | null;
  readonly acceptance: readonly AcceptanceRow[] | null;
  /** Legitimate scenarios B2 did not complete, from the per-scenario rows; null when the file has no rows. */
  readonly b2Blocked: readonly BlockedScenario[] | null;
  /** Optional parts present in the file but unreadable; shown in words, never guessed. */
  readonly dropped: readonly string[];
}

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly file: string; readonly problems: readonly string[] };
