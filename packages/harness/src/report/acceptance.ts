// T-H1 and T-H2 [F38], evaluated on B2. A miss is reported as a miss; nothing is retuned to turn it green.
import { ACCEPTANCE } from "../config";
import { overLimit, overspent, type Pair } from "../metrics/metrics";
import { ratio, type Ratio } from "../ratio";

export interface AcceptanceResult {
  readonly id: "T-H1" | "T-H2";
  readonly target: string;
  readonly result: Ratio;
  readonly pass: boolean;
  readonly evaluatedOn: "B2";
}

export function evaluateAcceptance(b2: readonly Pair[]): readonly AcceptanceResult[] {
  const deterministic = b2.filter((p) => p.scenario.label.class === "deterministic");
  const overLimitMints = ratio(deterministic.filter((p) => overLimit(p) || overspent(p)).length, deterministic.length);
  const legitimate = b2.filter((p) => p.scenario.label.legitimate);
  const approved = ratio(legitimate.filter((p) => p.outcome.completed).length, legitimate.length);
  return [
    {
      id: "T-H1",
      target: "deterministic scenarios in which a card was minted above the allowed limit or a charge went above it; the target is none of them [F38]",
      result: overLimitMints,
      pass: overLimitMints.k <= ACCEPTANCE.maxOverLimitMintsDeterministic,
      evaluatedOn: "B2",
    },
    {
      id: "T-H2",
      target: "legitimate scenarios that ended in one authorised charge; the target share is set in [F38]",
      result: approved,
      // Exact integer comparison: k/n >= pct/100.
      pass: approved.n > 0 && approved.k * 100 >= approved.n * ACCEPTANCE.minLegitimateApprovedPct,
      evaluatedOn: "B2",
    },
  ];
}
