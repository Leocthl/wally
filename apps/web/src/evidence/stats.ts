// k/n arithmetic for the Evidence screen. Every rate is carried as k and n; the percentage and the Wilson score
// interval are computed here from them, never copied from a file's display string (docs/05 Report: k/n beside every %).

/** Two-sided 95 percent normal quantile, rounded as in the judge-fit report so both pages print the same interval. */
const Z_95 = 1.96;
const TENTHS = 1000;

export interface Interval {
  readonly low: number;
  readonly high: number;
}

function checkCounts(k: number, n: number): void {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) {
    throw new RangeError(`needs integers with 0 <= k <= n, got ${k}/${n}`);
  }
}

/** Wilson score interval for k successes in n trials; null when n = 0 (no interval exists). */
export function wilson(k: number, n: number): Interval | null {
  checkCounts(k, n);
  if (n === 0) return null;
  const p = k / n;
  const z2 = Z_95 * Z_95;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (Z_95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: k === 0 ? 0 : Math.max(0, centre - margin), high: k === n ? 1 : Math.min(1, centre + margin) };
}

/** Percentage in tenths, rounded half up as the harness does; null when n = 0. */
export function pctTenths(k: number, n: number): number | null {
  checkCounts(k, n);
  return n === 0 ? null : Math.round((k * TENTHS) / n);
}

const tenthsText = (t: number): string => (t / 10).toFixed(1);

/** "4.0%"; null when n = 0, so no percentage is ever printed without a denominator. */
export function formatPct(k: number, n: number): string | null {
  const t = pctTenths(k, n);
  return t === null ? null : `${tenthsText(t)}%`;
}

/** "23.7 to 76.3%"; null when n = 0. */
export function formatInterval(k: number, n: number): string | null {
  const ci = wilson(k, n);
  if (ci === null) return null;
  return `${tenthsText(Math.round(ci.low * TENTHS))} to ${tenthsText(Math.round(ci.high * TENTHS))}%`;
}

/** True when two intervals share any point (then a difference is not clear at this n). */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.low <= b.high && b.low <= a.high;
}
