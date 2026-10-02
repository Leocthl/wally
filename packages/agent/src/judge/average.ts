import { PROBABILITY_DECIMALS } from "./config";

export type Distribution = Readonly<Record<string, number>>;

const roundTo = (x: number): number => {
  const scale = 10 ** PROBABILITY_DECIMALS;
  return Math.round(x * scale) / scale;
};

/**
 * Mean of the per-rotation distributions, keyed in the caller's canonical label order, then normalised to sum 1.
 * Inputs are not modified. Callers validate each distribution first (parse.ts); an empty list gives all zeros.
 */
export function averageDistributions(dists: readonly Distribution[], labels: readonly string[]): Distribution {
  const means = labels.map((l) => (dists.length === 0 ? 0 : dists.reduce((sum, d) => sum + (d[l] ?? 0), 0) / dists.length));
  const total = means.reduce((a, b) => a + b, 0);
  return Object.fromEntries(labels.map((l, i) => [l, roundTo(total > 0 ? (means[i] ?? 0) / total : 0)]));
}
