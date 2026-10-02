// The end-to-end view of the gates: what R10 would do with each case under a set of thresholds, and how that
// compares with the labels. This is the figure F38 speaks about (legitimate scenarios approved). The engine in
// core is still the only producer of a Decision; this mirrors its comparisons, reading only.
import type { GateReport } from "./report";
import { verdictsAt } from "./verdicts";
import { wilson } from "./stats";
import type { GateThresholds } from "./thresholds";
import type { CaseResult } from "./types";

export type Outcome = "APPROVE" | "ESCALATE" | "DENY";

/** A failed or truncated call is an ESCALATE (R10.unavailable, I5); otherwise the strictest gate wins. */
export function outcomeFor(result: CaseResult, t: GateThresholds): Outcome {
  if (result.status !== "OK" || result.answers === null) return "ESCALATE";
  const v = verdictsAt(result.answers, t);
  if (v.injection === "DENY" || v.seller === "DENY") return "DENY";
  return v.scope === "ESCALATE" || v.seller === "ESCALATE" || v.escalate === "ESCALATE" ? "ESCALATE" : "APPROVE";
}

interface Interval {
  readonly low: number;
  readonly high: number;
}

export interface SystemLevel {
  readonly thresholds: GateThresholds;
  /** Cases the corpus labels proceed: nothing should stop them. */
  readonly legit: {
    readonly n: number;
    readonly approved: number;
    readonly approvedRate: number | null;
    readonly approvedCI: Interval | null;
    readonly blockedIds: readonly string[];
  };
  /** Cases the corpus labels escalate: something should stop them. */
  readonly shouldStop: {
    readonly n: number;
    readonly notApproved: number;
    readonly notApprovedRate: number | null;
    readonly notApprovedCI: Interval | null;
    readonly approvedIds: readonly string[];
  };
  /** Cases labelled injection. */
  readonly injected: {
    readonly n: number;
    readonly denied: number;
    readonly notApproved: number;
    readonly approvedIds: readonly string[];
  };
}

const rate = (k: number, n: number): number | null => (n === 0 ? null : k / n);

export function systemLevel(results: readonly CaseResult[], t: GateThresholds): SystemLevel {
  const withOutcome = results.map((r) => ({ r, outcome: outcomeFor(r, t) }));
  const legit = withOutcome.filter((x) => x.r.labels.escalate_or_proceed === "proceed");
  const stop = withOutcome.filter((x) => x.r.labels.escalate_or_proceed === "escalate");
  const inj = withOutcome.filter((x) => x.r.labels.injection_risk === "injection");
  const approvedLegit = legit.filter((x) => x.outcome === "APPROVE").length;
  const stopped = stop.filter((x) => x.outcome !== "APPROVE").length;
  return {
    thresholds: t,
    legit: {
      n: legit.length,
      approved: approvedLegit,
      approvedRate: rate(approvedLegit, legit.length),
      approvedCI: wilson(approvedLegit, legit.length),
      blockedIds: legit.filter((x) => x.outcome !== "APPROVE").map((x) => x.r.id),
    },
    shouldStop: {
      n: stop.length,
      notApproved: stopped,
      notApprovedRate: rate(stopped, stop.length),
      notApprovedCI: wilson(stopped, stop.length),
      approvedIds: stop.filter((x) => x.outcome === "APPROVE").map((x) => x.r.id),
    },
    injected: {
      n: inj.length,
      denied: inj.filter((x) => x.outcome === "DENY").length,
      notApproved: inj.filter((x) => x.outcome !== "APPROVE").length,
      approvedIds: inj.filter((x) => x.outcome === "APPROVE").map((x) => x.r.id),
    },
  };
}

/** The per-gate suggestions as one threshold set. A gate with no suggestion keeps its current value. */
export function suggestedThresholds(gates: readonly Pick<GateReport, "id" | "thresholdName" | "suggestion">[], current: GateThresholds): GateThresholds {
  const pick = (id: GateReport["id"], name: keyof GateThresholds): number => gates.find((g) => g.id === id)?.suggestion.t ?? current[name];
  const esc = pick("seller_escalate", "T_sell_esc");
  const deny = pick("seller_deny", "T_sell_deny");
  return {
    T_scope: pick("scope_fit", "T_scope"),
    T_inj: pick("injection_risk", "T_inj"),
    T_sell_esc: esc,
    // A DENY cannot sit at or below the ESCALATE threshold; raise it one grid step above if the fit says otherwise.
    T_sell_deny: deny > esc ? deny : Number((esc + 0.01).toFixed(2)),
    T_esc: pick("escalate_or_proceed", "T_esc"),
  };
}
