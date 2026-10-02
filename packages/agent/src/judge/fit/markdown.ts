// Renders the fit report as team-facing markdown: point form, tables first, no prose under headings.
// Writing rules from CLAUDE.md apply: no em dashes, no emoji, every figure with ms in it cites a register ID.
import { JUDGE_QUESTIONS } from "../questions";
import { GATES } from "./gates";
import type { OperatingPoint } from "./metrics";
import type { FitReport, GateReport } from "./report";

const num = (x: number | null, digits = 2): string => (x === null || Number.isNaN(x) ? "n/a" : x.toFixed(digits));
const ci = (i: { low: number; high: number } | null): string => (i === null ? "n/a" : `[${num(i.low)}, ${num(i.high)}]`);
const row = (cells: readonly (string | number)[]): string => `| ${cells.join(" | ")} |`;
const table = (head: readonly string[], rows: readonly (readonly (string | number)[])[]): string[] => [
  row(head),
  row(head.map(() => "---")),
  ...rows.map(row),
];

function summaryTable(r: FitReport): string[] {
  return table(
    ["Gate", "Threshold", "Current", "Suggested", "Basis", "Recall", "False-block", "Should stop", "Should pass"],
    r.gates.map((g) => {
      const p = g.suggestion.point;
      return [g.id, g.thresholdName, num(g.currentThreshold), g.suggestion.t === null ? "n/a" : num(g.suggestion.t), g.suggestion.kind, num(p?.recall ?? null), num(p?.falseBlockRate ?? null), g.nShouldStop, g.nShouldPass];
    }),
  );
}

function systemSection(r: FitReport): string[] {
  const line = (label: string, s: FitReport["system"]["current"]): (string | number)[] => [
    label,
    `T_inj ${num(s.thresholds.T_inj)}, T_sell_esc ${num(s.thresholds.T_sell_esc)}, T_sell_deny ${num(s.thresholds.T_sell_deny)}, T_scope ${num(s.thresholds.T_scope)}, T_esc ${num(s.thresholds.T_esc)}`,
    `${s.legit.approved} of ${s.legit.n}`,
    `${num(s.legit.approvedRate)} ${ci(s.legit.approvedCI)}`,
    `${s.shouldStop.notApproved} of ${s.shouldStop.n}`,
    `${s.injected.denied} of ${s.injected.n}`,
    `${s.injected.n - s.injected.notApproved} of ${s.injected.n}`,
  ];
  return [
    "## End to end: what R10 would do",
    "- **Legit approved** is the figure F38 sets a floor for (at least 0.90). Cases the corpus labels proceed: clean apparel, benign shipping, benign negations. A failed or truncated call counts as not approved (ESCALATE, I5).",
    "- **Suggested** applies every per-gate suggestion at once. Each gate was fitted alone against the same budget, so the combined false-block rate can be higher than any single one; T_sell_deny is kept above T_sell_esc.",
    "",
    ...table(
      ["Thresholds", "Values", "Legit approved", "Rate (Wilson 95)", "Should-stop not approved", "Injected cases denied", "Injected cases approved"],
      [line("current (F36, F50)", r.system.current), line("suggested", r.system.suggested)],
    ),
    "",
    `- **Legit cases blocked at the current thresholds**: ${r.system.current.legit.blockedIds.join(", ") || "none"}.`,
    `- **Injected cases approved at the current thresholds**: ${r.system.current.injected.approvedIds.join(", ") || "none"}.`,
    "",
  ];
}

function runSection(r: FitReport): string[] {
  const { statusCounts: s, latencyOk: l } = r.run;
  const lines = [
    "## Run quality",
    `- **Calls**: ${s.OK} OK, ${s.ERROR} ERROR, ${s.TIMEOUT} TIMEOUT of ${r.corpus.n}. ERROR and TIMEOUT mean ESCALATE (I5); ${r.run.truncated} of them were truncated input.`,
    l === null
      ? "- **Latency**: no OK call to measure."
      : `- **Judge step latency, OK calls only**: MEASURED(n=${l.n}) p50 ${num(l.median, 0)} ms, p95 ${num(r.run.latencyP95, 0)} ms, max ${num(l.max, 0)} ms; warm server, ${r.meta.rotations ? "k rotations per question" : "canonical order"} (compare F26, F34).`,
  ];
  if (r.run.failClosed.length === 0) return lines;
  return [
    ...lines,
    "",
    "### Calls that failed closed",
    ...table(
      ["Case", "Family", "Status", "Truncated", "Label says stop"],
      r.run.failClosed.map((f) => [f.id, f.category, f.status, f.inputTruncated ? "yes" : "no", f.shouldStop ? "yes" : "no (false escalation)"]),
    ),
  ];
}

const pointLine = (p: OperatingPoint): string =>
  `TP ${p.confusion.tp}, FP ${p.confusion.fp}, FN ${p.confusion.fn}, TN ${p.confusion.tn}; precision ${num(p.precision)}, recall ${num(p.recall)} ${ci(p.recallCI)}, false-block ${num(p.falseBlockRate)} ${ci(p.falseBlockCI)}`;

function gateSection(g: GateReport): string[] {
  const spec = GATES.find((x) => x.id === g.id);
  const riskNote = g.id === "scope_fit" ? "risk = P(out_of_scope)" : g.id === "injection_risk" ? "risk = P(suspicious) + P(injection)" : g.id === "escalate_or_proceed" ? "risk = P(escalate)" : "risk = P(high_risk)";
  return [
    `### ${g.id}${spec?.thresholdName === g.thresholdName && g.id.startsWith("seller") ? ` (${g.thresholdName})` : ""}`,
    `- **Rule**: ${g.rule}; ${g.thresholdName} is in F36 or F50.`,
    `- **Cases**: ${g.nShouldStop} should stop, ${g.nShouldPass} should pass, ${g.nExcluded} left out (failed calls or ambiguous labels).`,
    `- **Current ${g.thresholdName} = ${num(g.currentThreshold)}**: ${pointLine(g.current)}.`,
    `- **Suggested ${g.thresholdName} = ${g.suggestion.t === null ? "n/a" : num(g.suggestion.t)}** (${g.suggestion.kind}): ${g.suggestion.reason}.${g.suggestion.point === null ? "" : ` ${pointLine(g.suggestion.point)}.`}`,
    `- **Scores by label** (${riskNote}):`,
    "",
    ...table(
      ["Label", "n", "min", "p25", "median", "p75", "max", "mean"],
      g.distributions.map((d) => [d.label, d.summary?.n ?? 0, num(d.summary?.min ?? null), num(d.summary?.p25 ?? null), num(d.summary?.median ?? null), num(d.summary?.p75 ?? null), num(d.summary?.max ?? null), num(d.summary?.mean ?? null)]),
    ),
    "",
    `- **Threshold sweep** (${g.thresholdName} in the engine's units; ${g.id === "scope_fit" ? "stops when P(in_scope) < T" : "stops when the value >= T"}):`,
    "",
    ...table(
      ["T", "TP", "FP", "FN", "TN", "precision", "recall", "false-block"],
      g.sweep.map((p) => [num(p.t), p.confusion.tp, p.confusion.fp, p.confusion.fn, p.confusion.tn, num(p.precision), num(p.recall), num(p.falseBlockRate)]),
    ),
    "",
    `- **Calibration** (risk score against the share of should-stop cases; ECE ${num(g.calibration.ece, 3)}):`,
    "",
    ...table(
      ["Risk bin", "n", "mean risk", "observed rate"],
      g.calibration.bins.map((b) => [`${num(b.lo)} to ${num(b.hi)}`, b.n, num(b.meanRisk), num(b.positiveRate)]),
    ),
    "",
  ];
}

function anchorSection(r: FitReport): string[] {
  const verdict = (v: NonNullable<FitReport["anchors"][number]["liveVerdicts"]> | null): string => {
    if (v === null) return "n/a";
    const stops = [v.scope !== "pass" ? `scope ${v.scope}` : "", v.injection !== "pass" ? `injection ${v.injection}` : "", v.seller !== "pass" ? `seller ${v.seller}` : "", v.escalate !== "pass" ? `escalate ${v.escalate}` : ""].filter((x) => x !== "");
    return stops.length === 0 ? "pass" : stops.join(", ");
  };
  const val = (a: FitReport["anchors"][number]["live"], pick: (x: NonNullable<typeof a>) => number): string => (a === null ? "n/a" : num(pick(a)));
  return [
    "## Demo listings",
    "- **Live**: this run, same adapter and state as the corpus, with the demo cart and Scameter state. **Recorded**: the placeholder answers in data/fixtures/judge, served by the replay judge [F59]; they are not measurements.",
    "- **Columns**: P(out_of_scope), P(suspicious) + P(injection), P(high_risk), P(escalate).",
    "",
    ...table(
      ["Listing", "Expected", "Status", "Live scope, inj, seller, esc", "R10 live", "Recorded scope, inj, seller, esc", "R10 recorded"],
      r.anchors.map((a) => [
        a.name,
        a.note,
        a.status === "OK" ? "OK" : `${a.status}${a.inputTruncated ? " (truncated)" : ""}`,
        a.live === null ? "n/a" : `${val(a.live, (x) => x.scope_fit.out_of_scope)}, ${val(a.live, (x) => x.injection_risk.suspicious + x.injection_risk.injection)}, ${val(a.live, (x) => x.seller_risk.high_risk)}, ${val(a.live, (x) => x.escalate_or_proceed.escalate)}`,
        verdict(a.liveVerdicts),
        a.recorded === null ? "n/a" : `${val(a.recorded, (x) => x.scope_fit.out_of_scope)}, ${val(a.recorded, (x) => x.injection_risk.suspicious + x.injection_risk.injection)}, ${val(a.recorded, (x) => x.seller_risk.high_risk)}, ${val(a.recorded, (x) => x.escalate_or_proceed.escalate)}`,
        verdict(a.recordedVerdicts),
      ]),
    ),
    "",
  ];
}

function missSection(r: FitReport): string[] {
  if (r.misses.length === 0) return ["## Misses at the current thresholds", "- **None**: every case lands on the side its label says, for every gate.", ""];
  return [
    "## Misses at the current thresholds",
    "- **miss**: the label says stop and the gate passed it. **false_block**: the label says pass and the gate stopped it.",
    "",
    ...table(["Gate", "Case", "Kind", "Value"], r.misses.map((m) => [m.gate, m.id, m.kind, num(m.value)])),
    "",
  ];
}

function rotationSection(r: FitReport): string[] {
  if (r.rotation === null) return [];
  return [
    "## Option-order rotations against canonical order",
    `- **Same ${r.corpus.n} cases** answered twice: rotation-averaged (this report) and canonical order. Change is the largest per-option difference in probability.`,
    "",
    ...table(["Question", "Cases", "Mean change", "Max change", "Argmax flips"], r.rotation.map((q) => [q.question, q.cells, num(q.meanDelta, 4), num(q.maxDelta, 4), q.flips])),
    "",
  ];
}

/** Generated from the rows, so it cannot go stale: what windows do to the padded attacks that fail closed without them. */
function windowVerdict(rows: NonNullable<FitReport["windows"]>["rows"]): string {
  const attacks = rows.filter((w) => w.injectionLabel === "injection" || w.sellerLabel === "high_risk");
  const count = (o: string): number => attacks.filter((w) => w.windowed.outcome === o).length;
  const loosened = count("APPROVE");
  const base = `- **Padded attacks** (n=${attacks.length}): plain ESCALATEs ${attacks.filter((w) => w.plain.outcome === "ESCALATE").length}; windows DENY ${count("DENY")}, ESCALATE ${count("ESCALATE")}, APPROVE ${loosened}.`;
  return loosened === 0
    ? base
    : `${base} An APPROVE here is the judge missing an attack it also misses unpadded, so windows would loosen what the fail-closed rule holds. Keep them off unless that is accepted.`;
}

function windowSection(r: FitReport): string[] {
  if (r.windows === null) return [];
  return [
    "## Long listings: truncated or judged in windows",
    `- **Plain**: the whole listing in one state. Longer than one row (about 940 state tokens, F26) it comes back truncated, which is an ERROR and an ESCALATE (I5). **Windows**: windows of ${r.windows.windowChars} characters overlapping by ${r.windows.overlapChars}, one call each, worst window decides injection and seller risk, best window decides scope. Off by default.`,
    "- **Outcome** is what R10 does at the current thresholds.",
    windowVerdict(r.windows.rows),
    "",
    ...table(
      ["Case", "Chars", "Label: injection, seller", "Plain", "Windows", "Windows injection risk", "Windows seller risk"],
      r.windows.rows.map((w) => [
        w.id,
        w.textChars,
        `${w.injectionLabel}, ${w.sellerLabel}`,
        `${w.plain.status} ${w.plain.outcome}`,
        `${w.windowed.status} ${w.windowed.outcome}`,
        num(w.windowed.injectionRisk),
        num(w.windowed.sellerRisk),
      ]),
    ),
    "",
  ];
}

export function renderMarkdown(r: FitReport): string {
  const t = r.thresholds;
  const lines = [
    `# Judge fit ${r.meta.date}`,
    "",
    `- **Status**: ${r.provenance}, n=${r.corpus.n}. Where the F36 and F50 thresholds sit on invented listings, not an evaluation and not a held-out set. Thresholds fitted on the same cases look better than they will on real listings.`,
    `- **Run**: ${r.meta.commit === null ? "commit unknown" : `commit ${r.meta.commit.hash.slice(0, 8)}${r.meta.commit.dirty ? " (working tree had changes)" : ""}`}; server ${r.meta.server.baseUrl}, model ${r.meta.server.model}, checkpoint ${r.meta.server.revision ?? "unknown"}, device ${r.meta.server.device ?? "unknown"}; ${r.meta.rotations ? "option-order rotations averaged" : "canonical option order"}.`,
    `- **Current thresholds** (read from the register at run time): T_inj ${num(t.T_inj)}, T_sell_deny ${num(t.T_sell_deny)}, T_sell_esc ${num(t.T_sell_esc)}, T_scope ${num(t.T_scope)}, T_esc ${num(t.T_esc)} (F36, F50).`,
    `- **False-block budget**: ${num(r.falseBlockBudget)} per gate, the most F38 allows (at least 90 percent of legitimate scenarios approved). A ceiling, not a target.`,
    "- **Suggestion rule**: if every should-stop case scores on the stop side of every should-pass case, the middle of that gap. Otherwise the highest recall within the budget, else the best recall minus false-block rate. Ties go to the middle of the flat stretch.",
    "",
    "## Corpus",
    ...table(["Family", "Cases"], Object.entries(r.corpus.byCategory).map(([k, v]) => [k, v])),
    "",
    ...table(["Question", "Label counts"], JUDGE_QUESTIONS.map((q) => [q, Object.entries(r.corpus.labels[q] ?? {}).map(([k, v]) => `${k} ${v}`).join(", ")])),
    "",
    "## Suggested thresholds",
    ...summaryTable(r),
    "",
    ...systemSection(r),
    ...runSection(r),
    "",
    ...missSection(r),
    ...anchorSection(r),
    ...rotationSection(r),
    ...windowSection(r),
    "## Gates",
    ...r.gates.flatMap(gateSection),
    "## Limits",
    "- **Labels** are one author's judgement of invented listings. There is no second annotator and no real listing.",
    "- **Fit and test are the same cases**, so every figure is optimistic. The confidence intervals are Wilson 95 percent and are wide at this n.",
    "- **Language**: the checkpoint is English-derived; the Traditional Chinese cases are in the corpus to show that, not to excuse it.",
    "- **Truncation** is fail-closed by design: a call that loses part of the listing is an ERROR and ESCALATEs, even when the listing was honest.",
    "- **Latency** was measured against one shared single-worker server; queueing behind other callers was not controlled, so these are upper bounds for an idle server (compare F26).",
    "- **State**: the judge sees a compact state (mandate, categories, cart line, Scameter state, listing object). Text markers around the listing lowered injection separation in an earlier run and are not used; any change to the state needs a re-run.",
    "- **Re-run** after any change to the corpus, the state text, the questions or the checkpoint. Thresholds freeze at M5 [F41].",
    "",
  ];
  return lines.join("\n");
}
