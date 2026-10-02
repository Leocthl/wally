// Small statistics helpers for the fit report. Pure, no dependencies.

export const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Percentile by linear interpolation between order statistics (numpy default). `sortedAsc` must be sorted. */
export function percentile(sortedAsc: readonly number[], p: number): number {
  const last = sortedAsc.length - 1;
  if (last < 0) return Number.NaN;
  const rank = (Math.min(100, Math.max(0, p)) / 100) * last;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const a = sortedAsc[lo] ?? Number.NaN;
  const b = sortedAsc[hi] ?? Number.NaN;
  return a + (b - a) * (rank - lo);
}

export interface Summary {
  readonly n: number;
  readonly min: number;
  readonly p25: number;
  readonly median: number;
  readonly p75: number;
  readonly max: number;
  readonly mean: number;
}

export function summarize(values: readonly number[]): Summary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0] ?? Number.NaN,
    p25: percentile(sorted, 25),
    median: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    max: sorted[sorted.length - 1] ?? Number.NaN,
    mean: mean(sorted),
  };
}

/** Two-sided 95 percent normal quantile, a standard statistical constant (not a product threshold). */
const Z_95 = 1.96;

/** Wilson score interval for a proportion; honest about small samples. null when n is 0. */
export function wilson(successes: number, n: number): { readonly low: number; readonly high: number } | null {
  if (n <= 0) return null;
  const p = successes / n;
  const z2 = Z_95 * Z_95;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (Z_95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) };
}
