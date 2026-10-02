import { PROBABILITY_DECIMALS } from "./config";

export type Distribution = Readonly<Record<string, number>>;

const roundTo = (x: number): number => {
  const scale = 10 ** PROBABILITY_DECIMALS;
  return Math.round(x * scale) / scale;
};

/**
 * Mean of the per-rotation distributions, keyed in the caller's canonical label order. Not renormalised: parse.ts
 * has checked each row sums to 1 within PROBABILITY_SUM_TOLERANCE, and R10 takes the tighter of P(x) and
 * 1 - P(not x), so the raw means can only make a gate stricter; rescaling could turn a DENY at the threshold into a
 * pass (audit low). Inputs are not modified; an empty list gives all zeros.
 */
export function averageDistributions(dists: readonly Distribution[], labels: readonly string[]): Distribution {
  return Object.fromEntries(labels.map((l) => [l, roundTo(dists.length === 0 ? 0 : dists.reduce((sum, d) => sum + (d[l] ?? 0), 0) / dists.length)]));
}
