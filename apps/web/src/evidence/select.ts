// Which run to show, whether it is product evidence, how B2 compares, and how far an acceptance target was missed.
import { overlaps, wilson } from "./stats";
import type { AcceptanceRow, HarnessRun, Rate } from "./types";

export type PickReason = "live-all-real" | "newest-live" | "newest-recorded";

export function allComponentsReal(run: HarnessRun): boolean {
  return run.components !== null && run.components.length > 0 && run.components.every((c) => c.real === true);
}

const newestFirst = (a: HarnessRun, b: HarnessRun): number => b.runAtMs - a.runAtMs || b.file.localeCompare(a.file);

/** Newest live run with every component real; else the newest live run; else the newest recorded run. */
export function pickRun(runs: readonly HarnessRun[]): { readonly file: string; readonly reason: PickReason } | null {
  const sorted = [...runs].sort(newestFirst);
  const realLive = sorted.find((r) => r.mode === "live" && allComponentsReal(r));
  if (realLive) return { file: realLive.file, reason: "live-all-real" };
  const live = sorted.find((r) => r.mode === "live");
  if (live) return { file: live.file, reason: "newest-live" };
  const recorded = sorted.find((r) => r.mode === "recorded");
  return recorded ? { file: recorded.file, reason: "newest-recorded" } : null;
}

export function sortRuns(runs: readonly HarnessRun[]): readonly HarnessRun[] {
  return [...runs].sort(newestFirst);
}

export interface WiringStatus {
  readonly wiringOnly: boolean;
  /** False when the file carries no component flags at all. */
  readonly componentsConfirmed: boolean;
  /** The file's own reasons, verbatim. */
  readonly reasons: readonly string[];
}

/** Product evidence only when the file says so and every component is real; absent flags mean wiring-only. */
export function wiringStatus(run: HarnessRun): WiringStatus {
  const componentsConfirmed = run.components !== null && run.components.length > 0 && run.components.every((c) => c.real !== null);
  const valid = run.evidence?.valid === true && allComponentsReal(run) && run.dirty !== true;
  return { wiringOnly: !valid, componentsConfirmed, reasons: run.evidence?.reasons ?? [] };
}

export type Comparison = { readonly kind: "lower" | "higher" | "equal" | "none"; readonly overlap: boolean };

/** B2 against another baseline on a lower-is-better rate, from k/n; "none" when either side has no denominator. */
export function compareToB2(b2: Rate | null, other: Rate | null): Comparison {
  if (b2 === null || other === null || b2.n === 0 || other.n === 0) return { kind: "none", overlap: false };
  const left = b2.k * other.n;
  const right = other.k * b2.n;
  const a = wilson(b2.k, b2.n);
  const b = wilson(other.k, other.n);
  const overlap = a !== null && b !== null && overlaps(a, b);
  return { kind: left < right ? "lower" : left > right ? "higher" : "equal", overlap };
}

/** Lower-is-better comparison for latency in ms (no interval: percentiles carry no k/n). */
export function compareMs(b2: number | null, other: number | null): Comparison {
  if (b2 === null || other === null) return { kind: "none", overlap: false };
  return { kind: b2 < other ? "lower" : b2 > other ? "higher" : "equal", overlap: false };
}

/** F38 targets, mirrored from packages/harness/src/config.ts ACCEPTANCE (register row F38, ASSUMED). */
export const F38 = { maxOverLimitMints: 0, minApprovedPct: 90 } as const;

export interface Gap {
  /** False for ids this page has no target for; then the file's own verdict is shown as is. */
  readonly known: boolean;
  readonly met: boolean;
  /** T-H1: over-limit mints found. T-H2: more approvals needed to reach the target. */
  readonly short: number;
  /** False when the file's pass flag disagrees with its own k/n. */
  readonly consistent: boolean;
}

export function acceptanceGap(row: AcceptanceRow): Gap {
  const { k, n } = row.result;
  if (row.id === "T-H1") {
    const met = k <= F38.maxOverLimitMints;
    return { known: true, met, short: met ? 0 : k - F38.maxOverLimitMints, consistent: met === row.pass };
  }
  if (row.id === "T-H2") {
    const needed = Math.ceil((n * F38.minApprovedPct) / 100);
    const met = n > 0 && k * 100 >= n * F38.minApprovedPct;
    return { known: true, met, short: Math.max(0, needed - k), consistent: met === row.pass };
  }
  return { known: false, met: row.pass, short: 0, consistent: true };
}
