// What R10 would do with a judge record under a set of thresholds (shown for the demo listings in the report).
// The engine in core is the only producer of a Decision; this mirrors its comparisons for reading only.
import type { JudgeAnswers } from "@wally/core/generated";
import { gateById, stops } from "./gates";
import type { GateThresholds } from "./thresholds";

export interface Verdicts {
  readonly scope: "pass" | "ESCALATE";
  readonly injection: "pass" | "DENY";
  readonly seller: "pass" | "ESCALATE" | "DENY";
  readonly escalate: "pass" | "ESCALATE";
}

export function verdictsAt(a: JudgeAnswers, t: GateThresholds): Verdicts {
  return {
    scope: stops(gateById("scope_fit"), a, t.T_scope) ? "ESCALATE" : "pass",
    injection: stops(gateById("injection_risk"), a, t.T_inj) ? "DENY" : "pass",
    seller: stops(gateById("seller_deny"), a, t.T_sell_deny) ? "DENY" : stops(gateById("seller_escalate"), a, t.T_sell_esc) ? "ESCALATE" : "pass",
    escalate: stops(gateById("escalate_or_proceed"), a, t.T_esc) ? "ESCALATE" : "pass",
  };
}
