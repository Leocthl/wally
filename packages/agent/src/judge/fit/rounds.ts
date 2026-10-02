// Round 1 against round 2 of the held-out round: what the M8 input normalisation (model-facing listing text) did.
// Pure. Before/after values are taken under the same wording where both runs have it, and the R10 outcome under
// the current round's proposed thresholds, so the column isolates the input change.
import { gateById } from "./gates";
import { outcomeFor, type Outcome } from "./system";
import type { GateThresholds } from "./thresholds";
import type { TuneRun } from "./tune";
import { evaluateSplit, type Rate } from "./tune-report";
import type { CaseResult } from "./types";

export interface RoundSummary {
  readonly commit: string | null;
  readonly winner: string;
  readonly proposed: GateThresholds;
  readonly legitApproved: Rate;
  readonly injectedApproved: Rate;
  readonly highRiskApproved: Rate;
  readonly outOfScopeApproved: Rate;
}

export interface ChangeRow {
  readonly id: string;
  readonly split: "tuning" | "held-out";
  readonly textChanged: boolean;
  readonly wording: { readonly before: string; readonly after: string };
  readonly injection: { readonly before: number | null; readonly after: number | null };
  readonly outcome: { readonly before: Outcome; readonly after: Outcome };
}

export interface RoundComparison {
  readonly previous: RoundSummary;
  readonly current: RoundSummary;
  readonly rows: readonly ChangeRow[];
}

function summary(run: TuneRun): RoundSummary {
  if (run.selection === undefined || run.heldout === undefined) throw new Error("a round needs a selection and held-out results");
  const e = evaluateSplit(run.heldout.results, run.selection.proposed);
  return {
    commit: run.meta.commit?.hash.slice(0, 8) ?? null,
    winner: run.selection.winner,
    proposed: run.selection.proposed,
    legitApproved: e.legitApproved,
    injectedApproved: e.injectedApproved,
    highRiskApproved: e.highRiskApproved,
    outOfScopeApproved: e.outOfScopeApproved,
  };
}

/** The result for a case under the given wording if the run has it, else under that run's winner. */
function resultFor(run: TuneRun, id: string, wording: string): { readonly result: CaseResult; readonly wording: string } | null {
  const tuning = run.variants.find((v) => v.id === wording)?.results.find((r) => r.id === id);
  if (tuning !== undefined) return { result: tuning, wording };
  const held = run.heldout?.results.find((r) => r.id === id);
  return held === undefined ? null : { result: held, wording: run.selection?.winner ?? "unknown" };
}

const injection = (r: CaseResult): number | null => (r.answers === null ? null : gateById("injection_risk").engineValue(r.answers));

export function compareRounds(previous: TuneRun, current: TuneRun, ids: readonly string[], changed: ReadonlySet<string>): RoundComparison {
  const cur = summary(current);
  const held = new Set(current.split.heldoutIds);
  const rows = ids.flatMap((id): ChangeRow[] => {
    const before = resultFor(previous, id, cur.winner);
    const after = resultFor(current, id, cur.winner);
    if (before === null || after === null) return [];
    return [
      {
        id,
        split: held.has(id) ? "held-out" : "tuning",
        textChanged: changed.has(id),
        wording: { before: before.wording, after: after.wording },
        injection: { before: injection(before.result), after: injection(after.result) },
        outcome: { before: outcomeFor(before.result, cur.proposed), after: outcomeFor(after.result, cur.proposed) },
      },
    ];
  });
  return { previous: summary(previous), current: cur, rows };
}
