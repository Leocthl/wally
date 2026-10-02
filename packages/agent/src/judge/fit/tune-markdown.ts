// Renders the held-out round report as team-facing markdown: point form, tables first, k/n beside every rate.
// Writing rules from CLAUDE.md apply: no em dashes, no emoji, every figure with ms in it cites a register ID.
import type { GateThresholds } from "./thresholds";
import type { Rate, SplitEval, TuneReport } from "./tune-report";

const num = (x: number | null | undefined, digits = 2): string => (x === null || x === undefined || Number.isNaN(x) ? "n/a" : x.toFixed(digits));
const rate = (r: Rate): string => `${r.k} of ${r.n}, ${num(r.rate)} [${num(r.ci?.low)}, ${num(r.ci?.high)}]`;
const row = (cells: readonly (string | number)[]): string => `| ${cells.join(" | ")} |`;
const table = (head: readonly string[], rows: readonly (readonly (string | number)[])[]): string[] => [row(head), row(head.map(() => "---")), ...rows.map(row)];
const thresholdsLine = (t: GateThresholds): string => `T_inj ${num(t.T_inj)}, T_sell_deny ${num(t.T_sell_deny)}, T_sell_esc ${num(t.T_sell_esc)}, T_scope ${num(t.T_scope)}, T_esc ${num(t.T_esc)}`;

function header(r: TuneReport): string[] {
  const c = r.meta.commit;
  return [
    `# Judge fit ${r.meta.date}, held-out round`,
    "",
    `- **Status**: ${r.provenance}. Tuning n=${r.split.tuningN}, held-out n=${r.split.heldoutN}. The held-out split was judged once, after the wording and thresholds were fixed (decided ${r.decidedAt}, held-out run started ${r.heldout.startedAt}).`,
    `- **Run**: ${c === null ? "commit unknown" : `commit ${c.hash.slice(0, 8)}${c.dirty ? " (working tree had changes)" : ""}`}; server ${r.meta.server.baseUrl}, model ${r.meta.server.model}, checkpoint ${r.meta.server.revision ?? "unknown"}, device ${r.meta.server.device ?? "unknown"}; option-order rotations averaged.`,
    `- **Split rule** (fixed before any run): ${r.split.rule}.`,
    `- **Wording rule** (stated before the first run): ${r.selectionRule}`,
    `- **Threshold objective** (stated before the first run): ${r.objective}`,
    `- **Register thresholds** (F36, F50): ${thresholdsLine(r.registerThresholds)}.`,
    "- **Previous round**: the first fit (main at 437c7a8) used the same 77 cases to fit and to test, with no held-out split.",
    "",
  ];
}

function resultSection(r: TuneReport): string[] {
  const h = r.heldout;
  const p = h.atProposed;
  return [
    "## Result on the held-out split",
    `- **F38 floor** (at least 0.90 of legitimate scenarios approved, F38): legit approved ${rate(p.legitApproved)}. ${h.f38.met ? "Met on this split." : `Not met: short by ${num(h.f38.shortBy)} of the floor.`}`,
    `- **Injected approved**: ${rate(p.injectedApproved)}. **High-risk seller approved**: ${rate(p.highRiskApproved)}. **Out of scope approved**: ${rate(p.outOfScopeApproved)}.`,
    `- **Wording**: ${r.winner} (ranked first of ${r.variants.length} on tuning). **escalate_or_proceed**: tuning AUC ${num(r.escalate.tuningAuc)}; ${r.escalate.searched ? "searched, it carries signal" : "below the 0.75 bar, so T_esc is not refitted and keeps its register value"}.`,
    "",
    ...table(
      ["Threshold", "Register (F36, F50)", "Proposed"],
      (["T_inj", "T_sell_deny", "T_sell_esc", "T_scope", "T_esc"] as const).map((k) => [k, num(r.registerThresholds[k]), k === "T_esc" && !r.escalate.searched ? `${num(r.proposed[k])} (unchanged)` : num(r.proposed[k])]),
    ),
    "",
  ];
}

function evalRows(a: SplitEval, b: SplitEval): (string | number)[][] {
  return [
    ["Legit approved", rate(a.legitApproved), rate(b.legitApproved)],
    ["Injected approved", rate(a.injectedApproved), rate(b.injectedApproved)],
    ["High-risk seller approved", rate(a.highRiskApproved), rate(b.highRiskApproved)],
    ["Out of scope approved", rate(a.outOfScopeApproved), rate(b.outOfScopeApproved)],
    ["Should-stop not approved", rate(a.shouldStopNotApproved), rate(b.shouldStopNotApproved)],
  ];
}

function heldoutSection(r: TuneReport): string[] {
  const h = r.heldout;
  const p = h.atProposed;
  const auc = (id: string): string => num(id === "scope_fit" ? h.aucs.scope : id === "injection_risk" ? h.aucs.injection : id === "escalate_or_proceed" ? h.aucs.escalate : h.aucs.seller);
  return [
    "## Held-out split, evaluated once (R10 outcome view)",
    "- **Columns**: k of n, rate [Wilson 95]. A failed or truncated call counts as not approved (ESCALATE, I5). Same wording in both columns.",
    "",
    ...table(["Measure", "Proposed thresholds", "Register thresholds"], evalRows(p, h.atRegister)),
    "",
    "### Per gate, proposed thresholds",
    ...table(["Gate", "Threshold", "False-block", "Recall", "AUC"], p.gates.map((g) => [g.id, num(g.threshold), rate(g.falseBlock), rate(g.recall), auc(g.id)])),
    "",
    "### Legitimate cases not approved",
    ...(p.legitBlocked.length === 0 ? ["- **None**."] : table(["Case", "Family", "Outcome", "Stopped by"], p.legitBlocked.map((c) => [c.id, c.category, c.outcome, c.why]))),
    "",
    "### Should-stop cases approved",
    ...(p.stopApproved.length === 0 ? ["- **None**."] : table(["Case", "Family"], p.stopApproved.map((c) => [c.id, c.category]))),
    "",
    "### By family",
    ...table(["Family", "Cases", "Approved"], p.byFamily.map((f) => [f.family, f.n, f.approved])),
    "",
  ];
}

function variantSection(r: TuneReport): string[] {
  return [
    "## Question wording on the tuning split, every variant",
    "- **Each row** is that variant at its own joint fit. Nothing was dropped.",
    "",
    ...table(
      ["Variant", "Rank", "Idea", "OK calls", "Legit approved", "Injected approved", "High-risk approved", "Out of scope approved", "AUC scope, inj, seller, esc", "Fitted thresholds"],
      r.variants.map((v) => [v.id, v.rank, v.idea, `${v.okCalls} of ${v.n}`, rate(v.tuning.legitApproved), rate(v.tuning.injectedApproved), rate(v.tuning.highRiskApproved), rate(v.tuning.outOfScopeApproved), `${num(v.aucs.scope)}, ${num(v.aucs.injection)}, ${num(v.aucs.seller)}, ${num(v.aucs.escalate)}`, thresholdsLine(v.thresholds)]),
    ),
    "",
  ];
}

function anchorSection(r: TuneReport): string[] {
  const four = (a: TuneReport["anchors"][number]["live"]): string =>
    a === null ? "n/a" : `${num(a.scope_fit.out_of_scope)}, ${num(a.injection_risk.suspicious + a.injection_risk.injection)}, ${num(a.seller_risk.high_risk)}, ${num(a.escalate_or_proceed.escalate)}`;
  return [
    "## Demo listings, chosen wording, proposed thresholds",
    "- **Columns**: P(out_of_scope), P(suspicious) + P(injection), P(high_risk), P(escalate). Recorded is what data/fixtures/judge holds when this report was written (judge:record output once re-recorded).",
    "",
    ...table(["Listing", "Expected", "Status", "Live", "R10 live", "Recorded", "R10 recorded"], r.anchors.map((a) => [a.name, a.note, a.status, four(a.live), a.liveOutcome ?? "n/a", four(a.recorded), a.recordedOutcome ?? "n/a"])),
    "",
  ];
}

function windowSection(r: TuneReport): string[] {
  const held = r.windows.filter((w) => w.split === "held-out");
  const attacks = held.filter((w) => w.label !== "legit");
  const legit = held.filter((w) => w.label === "legit");
  return [
    "## Long listings: plain against windows",
    "- **Plain** sends the whole listing; past one row (about 940 state tokens, F26) it is truncated, an ERROR and an ESCALATE (I5). **Windows** judge overlapping windows, the worst window decides.",
    `- **Held-out**: padded attacks ${attacks.length}, windows approve ${attacks.filter((w) => w.windowed === "APPROVE").length}; long legit ${legit.length}, windows approve ${legit.filter((w) => w.windowed === "APPROVE").length}, plain approves ${legit.filter((w) => w.plain === "APPROVE").length}.`,
    "- **Decision**: windows stay OFF by default. Turning them on needs held-out evidence that no padded attack gets through at a sample size that can show it; a handful of cases cannot.",
    "",
    ...table(["Case", "Split", "Chars", "Label", "Plain", "Windows"], r.windows.map((w) => [w.id, w.split, w.textChars, w.label, w.plain, `${w.windowedStatus} ${w.windowed}`])),
    "",
  ];
}

function tailSection(r: TuneReport): string[] {
  const l = r.heldout.latency;
  const s = r.heldout.statusCounts;
  const winner = r.variants.find((v) => v.id === r.winner);
  const injected = r.heldout.atProposed.injectedApproved.n + (winner?.tuning.injectedApproved.n ?? 0);
  return [
    "## Run quality and latency",
    `- **Held-out calls**: ${s.OK} OK, ${s.ERROR} ERROR, ${s.TIMEOUT} TIMEOUT; ${r.heldout.truncated} truncated (ESCALATE, I5).`,
    `- **Judge step latency, held-out OK calls**: MEASURED(n=${l.n}) p50 ${num(l.p50, 0)} ms, p95 ${num(l.p95, 0)} ms, max ${num(l.max, 0)} ms. Shared single-worker server while other agents called it, so this is not a benchmark (compare F26, F34).`,
    "",
    "## Limits",
    "- **Labels** are one author's judgement of invented listings; no second annotator, no real listing.",
    "- **Held-out is small**: the Wilson intervals above are wide; a few cases move a rate by several points.",
    `- **Injected cases**: ${injected} in all (${r.heldout.atProposed.injectedApproved.n} held-out), the ones written for the first fit; this round added no new injection text, so injected recall rests on few held-out cases.`,
    "- **Language**: the checkpoint is English-derived; zh-HK cases are here to measure that, not to excuse it.",
    "- **Truncation** fails closed by design: a long honest listing ESCALATEs (I5).",
    "- **Re-run** after any change to the corpus, the state, the wording or the checkpoint. Thresholds freeze at M5 [F41].",
    "",
  ];
}

export function renderTuneMarkdown(r: TuneReport): string {
  return [...header(r), ...resultSection(r), ...heldoutSection(r), ...variantSection(r), ...anchorSection(r), ...windowSection(r), ...tailSection(r)].join("\n");
}
