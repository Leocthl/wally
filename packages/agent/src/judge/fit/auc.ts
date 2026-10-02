// Area under the ROC curve of a gate's risk score (Mann-Whitney): the chance that a random should-stop case
// scores riskier than a random should-pass case, ties counting half. MEASURED on SIMULATED, labelled cases.
import type { Sample } from "./metrics";

export function auc(samples: readonly Sample[]): number | null {
  const pos = samples.filter((s) => s.positive).map((s) => s.risk);
  const neg = samples.filter((s) => !s.positive).map((s) => s.risk);
  if (pos.length === 0 || neg.length === 0) return null;
  const wins = pos.reduce((sum, p) => sum + neg.reduce((acc, n) => acc + (p > n ? 1 : p === n ? 0.5 : 0), 0), 0);
  return wins / (pos.length * neg.length);
}
