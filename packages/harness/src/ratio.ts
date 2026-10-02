// A rate is always carried as k and n. Nothing in the harness prints or stores a bare percentage.

export interface Ratio {
  readonly k: number;
  readonly n: number;
}

export function ratio(k: number, n: number): Ratio {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) {
    throw new RangeError(`ratio needs integers with 0 <= k <= n, got ${k}/${n}`);
  }
  return { k, n };
}

/** "3/150 (2.0%)". k/n comes first; an empty denominator prints n/a instead of a number. */
export function formatRatio(r: Ratio): string {
  if (r.n === 0) return `${r.k}/${r.n} (n/a)`;
  const tenths = Math.round((r.k * 1000) / r.n);
  return `${r.k}/${r.n} (${(tenths / 10).toFixed(1)}%)`;
}

/** The stored form: k and n plus the display string that carries them. */
export interface RatioRecord extends Ratio {
  readonly display: string;
}

export function toRecord(r: Ratio): RatioRecord {
  return { k: r.k, n: r.n, display: formatRatio(r) };
}
