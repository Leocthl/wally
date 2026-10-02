// data/results/judge-thresholds-proposal.json: what the lead copies into the register (F36, F50) and core config.
// This tool never edits either. Pure: the caller passes the clock and the pinned checkpoint revision.
import type { Rate, SplitEval, TuneReport } from "./tune-report";

export interface ThresholdProposal {
  readonly generated_at: string;
  readonly model_revision: string;
  readonly wording_variant: string;
  readonly tuning_n: number;
  readonly heldout_n: number;
  readonly thresholds: { readonly t_inj: number; readonly t_sell_deny: number; readonly t_sell_esc: number; readonly t_scope: number; readonly t_esc: number | null };
  readonly objective: string;
  readonly heldout_results: Readonly<Record<string, unknown>>;
  readonly caveats: readonly string[];
}

const rateJson = (r: Rate) => ({ k: r.k, n: r.n, rate: r.rate, wilson95: r.ci });

function evalJson(e: SplitEval) {
  return {
    legit_approved: rateJson(e.legitApproved),
    injected_approved: rateJson(e.injectedApproved),
    high_risk_seller_approved: rateJson(e.highRiskApproved),
    out_of_scope_approved: rateJson(e.outOfScopeApproved),
    should_stop_not_approved: rateJson(e.shouldStopNotApproved),
    gates: Object.fromEntries(e.gates.map((g) => [g.id, { threshold: g.threshold, false_block: rateJson(g.falseBlock), recall: rateJson(g.recall) }])),
    legit_not_approved: e.legitBlocked.map((c) => ({ id: c.id, family: c.category, outcome: c.outcome, stopped_by: c.why })),
    should_stop_approved: e.stopApproved.map((c) => c.id),
  };
}

export function buildProposal(r: TuneReport, opts: { readonly generatedAt: string; readonly modelRevision: string }): ThresholdProposal {
  const h = r.heldout;
  const p = r.proposed;
  return {
    generated_at: opts.generatedAt,
    model_revision: opts.modelRevision,
    wording_variant: r.winner,
    tuning_n: r.split.tuningN,
    heldout_n: r.split.heldoutN,
    thresholds: { t_inj: p.T_inj, t_sell_deny: p.T_sell_deny, t_sell_esc: p.T_sell_esc, t_scope: p.T_scope, t_esc: r.escalate.searched ? p.T_esc : null },
    objective: r.objective,
    heldout_results: {
      provenance: r.provenance,
      evaluated_once_at: h.startedAt,
      at_proposed: evalJson(h.atProposed),
      at_register_thresholds: { thresholds: h.atRegister.thresholds, ...evalJson(h.atRegister) },
      f38: { floor: h.f38.floor, met: h.f38.met, short_by: h.f38.shortBy, legit_approved: rateJson(h.atProposed.legitApproved) },
      demo_listings: r.anchors.map((a) => ({ name: a.name, expected: a.note, status: a.status, r10_live: a.liveOutcome, r10_recorded: a.recordedOutcome })),
      latency_ms: { ...h.latency, note: "shared single-worker server while other agents called it; not a benchmark (compare F26, F34)" },
      calls: { ...h.statusCounts, truncated: h.truncated },
    },
    caveats: [
      "MEASURED(n) on SIMULATED listings with single-annotator labels; says nothing about real listings.",
      "Wilson 95 intervals are wide at this n; a few cases move a rate by several points.",
      "t_esc is null when escalate_or_proceed has no signal on tuning (AUC below 0.75): keep the register value; the held-out figures include it at that value.",
      "No new injection text was written this round: injected cases are the first-fit ones, split between tuning and held-out, so injected-approved rests on few held-out cases.",
      "Chinese input stays unvalidated: the checkpoint is English-derived.",
      "Long listings past one row still ESCALATE by design (I5); window judging stays off.",
      "Thresholds and wording go together: these values hold for the wording variant named here only.",
    ],
  };
}
