// Picks the question wording, by a rule stated before the first tuning run (B-19). Tuning split only.
//   1. Every variant gets its own joint threshold fit (joint.ts), so each is compared at its best feasible point
//      (at most 10 percent of injected, high-risk and out-of-scope tuning cases approved).
//   2. The most legitimate tuning cases approved wins.
//   3. Ties: the higher mean AUC over the scope, injection and seller gates; then the more should-stop cases not
//      approved; then the earlier variant (v0 first, the conservative choice).
import { auc } from "./auc";
import { gateById, type GateId } from "./gates";
import { fitJoint, type JointFit } from "./joint";
import { samplesFor } from "./metrics";
import type { CaseResult } from "./types";

export const SELECTION_RULE =
  "Each variant gets its own joint fit on the tuning split; the most legitimate tuning cases approved wins; ties go to the higher mean AUC over the scope, injection and seller gates (those with both classes), then to more should-stop cases not approved, then to the earlier variant.";

export interface GateAucs {
  readonly scope: number | null;
  readonly injection: number | null;
  readonly seller: number | null;
  readonly escalate: number | null;
}

export interface VariantFit {
  readonly id: string;
  readonly fit: JointFit;
  readonly aucs: GateAucs;
  readonly meanAuc: number | null;
}

const gateAuc = (id: GateId, results: readonly CaseResult[]): number | null => auc(samplesFor(gateById(id), results));

export function gateAucs(results: readonly CaseResult[]): GateAucs {
  return { scope: gateAuc("scope_fit", results), injection: gateAuc("injection_risk", results), seller: gateAuc("seller_escalate", results), escalate: gateAuc("escalate_or_proceed", results) };
}

export function fitVariant(id: string, results: readonly CaseResult[], currentTEsc: number): VariantFit {
  const aucs = gateAucs(results);
  const known = [aucs.scope, aucs.injection, aucs.seller].filter((x): x is number => x !== null);
  const meanAuc = known.length === 0 ? null : known.reduce((a, b) => a + b, 0) / known.length;
  return { id, fit: fitJoint(results, { currentTEsc }), aucs, meanAuc };
}

function compare(a: VariantFit, b: VariantFit): number {
  const legit = b.fit.counts.legitApproved.k - a.fit.counts.legitApproved.k;
  if (legit !== 0) return legit;
  const meanAuc = (b.meanAuc ?? 0) - (a.meanAuc ?? 0);
  if (Math.abs(meanAuc) > 1e-12) return meanAuc;
  return b.fit.counts.stopNotApproved.k - a.fit.counts.stopNotApproved.k;
}

/** Ranking best first; Array.prototype.sort is stable, so equal variants keep their listed order. */
export function rankVariants(fits: readonly VariantFit[]): readonly VariantFit[] {
  return [...fits].sort(compare);
}
