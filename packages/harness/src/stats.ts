// Latency statistics. Linear interpolation between order statistics, the method services/laya/smoke.mjs uses.

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new RangeError("percentile of an empty sample");
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0] as number;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (rank - lo);
}

export interface Summary {
  readonly n: number;
  readonly min: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
  readonly mean: number;
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

export function summarize(values: readonly number[]): Summary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    n: sorted.length,
    min: round1(sorted[0] as number),
    p50: round1(percentile(sorted, 50)),
    p95: round1(percentile(sorted, 95)),
    max: round1(sorted[sorted.length - 1] as number),
    mean: round1(sum / sorted.length),
  };
}
