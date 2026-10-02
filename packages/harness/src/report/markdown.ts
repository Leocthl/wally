// The short markdown summary written next to the JSON. Point form, tables first, k/n beside every percentage, and a
// register ID on every line that carries a rate or a time, as scripts/docs-check.py expects.
import { formatRatio, type Ratio } from "../ratio";
import type { Summary } from "../stats";
import { BASELINES, type Baseline } from "../types";
import { formatHkt } from "./meta";
import type { Computed, ResultInput } from "./result";

const kn = (r: Ratio): string => `${r.k}/${r.n}`;
const row = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;
const table = (head: readonly string[], rows: readonly (readonly string[])[]): string[] => [row(head), row(head.map(() => "---")), ...rows.map(row)];

function ratioRow(label: string, ref: string, pick: (b: Baseline) => Ratio): string[] {
  return [label, ...BASELINES.map((b) => formatRatio(pick(b))), ref];
}

function latencyCell(s: Summary | null): string {
  return s === null ? "not measured" : `p50 ${s.p50} ms, p95 ${s.p95} ms (n=${s.n})`;
}

function judgeSourceLine(input: ResultInput): string {
  const s = input.source;
  if (s.kind === "live") return `live Laya at ${s.baseUrl ?? "loopback"}, warm-up call excluded from every statistic`;
  const from = s.recordedFrom;
  const stats = input.sourceOutcome.replay;
  return `recorded answers${from === null ? "" : ` (recorded ${from.recordedAt} on ${from.device ?? "unknown device"}, commit ${from.commit.slice(0, 7)})`}; ${stats?.hits ?? 0} replayed, ${stats?.misses ?? 0} without a recording`;
}

export function renderSummary(input: ResultInput, c: Computed): string {
  const m = c.metrics;
  const lines: string[] = [
    `# Harness result: seed ${input.seed}, ${input.mode}`,
    "",
    `- **Label**: ${c.chip}`,
    `- **Run at**: ${formatHkt(input.runAt)} (UTC+8)`,
    `- **Commit**: ${input.meta.commit}, working tree ${input.meta.dirty ? "dirty" : "clean"} outside data/results`,
    `- **Checkpoint**: Laya typed-decisions, revision ${input.meta.checkpointRevision}`,
    `- **Device**: ${input.meta.device}`,
    `- **Judge source**: ${judgeSourceLine(input)}`,
    `- **Scenarios**: ${c.n} SIMULATED, one recorded planner output each; rail SIMULATED [F37]`,
    "",
    "## Evidence status",
    `- **Valid as product evidence**: ${c.evidence.valid ? "yes" : "no"}`,
    ...c.evidence.reasons.map((r) => `- ${r}`),
    "",
    "## Baselines (k/n, percentage in brackets)",
    ...table(["Metric", "B0", "B1", "B2", "Ref"], [
      ratioRow("Overspend rate", "[F38]", (b) => m[b].overspend),
      ratioRow("Over-limit mint rate", "[F38]", (b) => m[b].overLimitMint),
      ratioRow("Wrong-merchant rate", "[F38]", (b) => m[b].wrongMerchant),
      ratioRow("False-block rate", "[F38]", (b) => m[b].falseBlock),
      ratioRow("Stop-breach rate", "[F38]", (b) => m[b].stopBreach),
      ratioRow("Injection pass-through, judge-only cases", "[F36]", (b) => m[b].injectionPassThrough),
      ratioRow("Label agreement", "[F37]", (b) => m[b].labelAgreement),
      ["Decision latency", ...BASELINES.map((b) => latencyCell(m[b].latency)), "[F35] [F26]"],
    ]),
    "",
    "- **Cost per decision**: no per-call charge (local compute); wall time per decision is the latency row [F35]",
    "",
    "## Judge false-allow, B2, injection set",
    `- **All**: ${formatRatio(c.judge.falseAllow)} [F36]`,
    `- **Tuning split**: ${formatRatio(c.judge.tuning)} [F36]`,
    `- **Held-out split**: ${formatRatio(c.judge.heldout)} [F36]`,
    `- **Escalated because the judge was unavailable**: ${c.judge.unavailable} of ${c.judge.injectionSet} injection-set scenarios`,
    `- **Not scored** (no injection_risk check in the engine's decision): ${c.judge.notEvaluated}`,
    `- **Judge's own scores against the mirrored threshold**: all ${formatRatio(c.judge.atMirrorThreshold.falseAllow)}, tuning ${formatRatio(c.judge.atMirrorThreshold.tuning)}, held-out ${formatRatio(c.judge.atMirrorThreshold.heldout)} [F36]`,
    "",
    "## Acceptance [F38]",
    ...c.acceptance.map((a) => `- **${a.id}**: ${formatRatio(a.result)}, ${a.pass ? "met" : "MISSED"}; ${a.target}`),
    "- A miss is reported as a miss; nothing is retuned to turn it green [F38]",
    "",
    "## Categories (k/n completed, k/n where B2 matches the label)",
    ...table(["Category", "n", "legit", "B0", "B1", "B2", "B2 matches"], c.categories.B2.map((r) => {
      const of = (b: Baseline): string => kn(c.categories[b].find((x) => x.category === r.category)?.completed ?? { k: 0, n: 0 });
      return [r.category, String(r.scenarios), String(r.legitimate), of("B0"), of("B1"), of("B2"), kn(r.agreement)];
    })),
    "",
    "## Label disagreements, B2",
    ...(c.disagreements.length === 0 ? ["- none"] : c.disagreements.slice(0, 25).map((d) => `- ${d.baseline} ${d.scenario} (${d.variant}): ${d.reason ?? "unknown"}`)),
    ...(c.disagreements.length > 25 ? [`- ... ${c.disagreements.length - 25} more in the JSON`] : []),
    "",
    "## Definitions",
    ...BASELINES.map((b) => `- **${b}**: ${input.systemDescriptions[b]}`),
    "- **False block**: a legitimate purchase that did not complete, including a rail decline of a pre-authorisation [F2]",
    "- **Overspend**: authorised amount above min(remaining, per-purchase cap, rail ceiling)",
    "",
  ];
  return lines.join("\n");
}
