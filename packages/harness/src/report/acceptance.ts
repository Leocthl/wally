// T-H1 and T-H2 [F38], evaluated on B2. A miss is reported as a miss; nothing is retuned to turn it green, and a judge
// timeout is never retried: it counts as a block in T-H2 as measured, and the same cases are listed again, with how many
// they are and under what load, in the two companion numbers so a reader can see how much of a miss is the machine.
import { ACCEPTANCE } from "../config";
import { overLimit, overspent, type Pair } from "../metrics/metrics";
import { ratio, type Ratio } from "../ratio";

export type AcceptanceId = "T-H1" | "T-H2" | "T-H2-after-answer" | "T-H2-without-timeouts";

export interface AcceptanceResult {
  readonly id: AcceptanceId;
  readonly target: string;
  readonly result: Ratio;
  readonly pass: boolean;
  readonly evaluatedOn: "B2";
}

/** Exact integer comparison: k/n >= pct/100. */
const meetsShare = (r: Ratio): boolean => r.n > 0 && r.k * 100 >= r.n * ACCEPTANCE.minLegitimateApprovedPct;

const asked = (p: Pair): boolean => p.outcome.escalations.length > 0;
const timedOut = (p: Pair): boolean => p.outcome.judge?.status === "TIMEOUT";

/** Legitimate scenarios whose judge call timed out: not retried, listed apart. */
export function legitimateTimeouts(b2: readonly Pair[]): readonly Pair[] {
  return b2.filter((p) => p.scenario.label.legitimate && timedOut(p));
}

export function evaluateAcceptance(b2: readonly Pair[]): readonly AcceptanceResult[] {
  const deterministic = b2.filter((p) => p.scenario.label.class === "deterministic");
  const overLimitMints = ratio(deterministic.filter((p) => overLimit(p) || overspent(p)).length, deterministic.length);
  const legitimate = b2.filter((p) => p.scenario.label.legitimate);
  const withoutAsking = ratio(legitimate.filter((p) => p.outcome.completed && !asked(p)).length, legitimate.length);
  const afterAnswer = ratio(legitimate.filter((p) => p.outcome.completed).length, legitimate.length);
  const untouched = legitimate.filter((p) => !timedOut(p));
  const withoutTimeouts = ratio(untouched.filter((p) => p.outcome.completed && !asked(p)).length, untouched.length);
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
      target: "legitimate scenarios approved and charged once without asking the shopper, as measured: a judge timeout counts as a block; the target share is set in [F38]",
      result: withoutAsking,
      pass: meetsShare(withoutAsking),
      evaluatedOn: "B2",
    },
    {
      id: "T-H2-after-answer",
      target: "legitimate scenarios charged once, counting those the engine escalated and the simulated shopper approved; same target share [F38]",
      result: afterAnswer,
      pass: meetsShare(afterAnswer),
      evaluatedOn: "B2",
    },
    {
      id: "T-H2-without-timeouts",
      target: "legitimate scenarios approved without asking, over those whose judge call did not time out; same target share [F38]",
      result: withoutTimeouts,
      pass: meetsShare(withoutTimeouts),
      evaluatedOn: "B2",
    },
  ];
}
