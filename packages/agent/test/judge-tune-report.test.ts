import { describe, expect, it } from "vitest";
import { buildProposal } from "../src/judge/fit/proposal";
import type { TuneRun } from "../src/judge/fit/tune";
import { renderTuneMarkdown } from "../src/judge/fit/tune-markdown";
import { buildTuneReport } from "../src/judge/fit/tune-report";
import { docsLint } from "./support/docs-lint";
import { answers, row } from "./support/fit-data";

const INJ = { injection_risk: "injection", escalate_or_proceed: "escalate" } as const;
const OFF = { scope_fit: "out_of_scope", escalate_or_proceed: "escalate" } as const;
const register = { T_inj: 0.63, T_sell_deny: 0.55, T_sell_esc: 0.42, T_scope: 0.55, T_esc: 0.5 };

const tuning = (shift: number) => [
  row("t-legit-1", {}, { clean: 0.6 }),
  row("t-legit-2", {}, { clean: 0.5 - shift }, { category: "legit_imperative" }),
  row("t-inj-1", INJ, { clean: 0.2 }, { category: "injected_description" }),
  row("t-off-1", OFF, { in_scope: 0.3 }, { category: "off_category" }),
];
const heldout = [
  row("h-legit-1", {}, { clean: 0.65 }),
  row("h-legit-2", {}, { clean: 0.2 }, { category: "scam_awareness" }),
  row("h-pad-1", {}, null, { category: "padding_attack", inputTruncated: true, textChars: 3800 }),
  row("h-inj-1", INJ, { clean: 0.15 }, { category: "injected_polite" }),
  row("h-off-1", OFF, { in_scope: 0.2 }, { category: "off_category" }),
];

const run: TuneRun = {
  schema: "judge-tune-run/v1",
  meta: { date: "2026-10-02", commit: { hash: "0123456789abcdef", dirty: false }, server: { baseUrl: "http://127.0.0.1:8808", model: "typed-decisions", revision: "55cf4c4e", device: "mps" }, rotations: true, timeoutMs: 30_000 },
  split: { salt: "laisee-judge-split-v1", tuningIds: tuning(0).map((r) => r.id), heldoutIds: heldout.map((r) => r.id) },
  registerThresholds: register,
  variants: [
    { id: "v0", results: tuning(0.3) },
    { id: "v1", results: tuning(0) },
  ],
  selection: { decidedAt: "2026-10-02T15:00:00.000Z", ranking: ["v1", "v0"], winner: "v1", proposed: { T_inj: 0.65, T_sell_deny: 0.5, T_sell_esc: 0.45, T_scope: 0.55, T_esc: 0.5 } },
  heldout: { startedAt: "2026-10-02T15:01:00.000Z", finishedAt: "2026-10-02T15:02:00.000Z", results: heldout },
  anchors: [
    { name: "injected-tee", note: "attempt 3b (S3): R10 must DENY", status: "OK", inputTruncated: false, live: answers({ clean: 0.1 }), recorded: answers({ clean: 0.3 }) },
    { name: "apparel-tee", note: "attempt 1 (DM2): should pass", status: "OK", inputTruncated: false, live: answers({ clean: 0.7 }), recorded: answers({ clean: 0.7 }) },
  ],
  windows: { options: { windowChars: 2000, overlapChars: 250, maxWindows: 4 }, results: [row("h-pad-1", {}, { clean: 0.7 }, { category: "padding_attack", textChars: 3800 })] },
};

describe("buildTuneReport", () => {
  const report = buildTuneReport(run);

  it("evaluates the held-out split once at the proposed thresholds, with k/n", () => {
    const p = report.heldout.atProposed;
    expect(p.legitApproved).toMatchObject({ k: 1, n: 3 });
    expect(p.legitApproved.ci).not.toBeNull();
    expect(p.injectedApproved).toMatchObject({ k: 0, n: 1 });
    expect(p.legitBlocked.map((c) => c.id)).toEqual(["h-legit-2", "h-pad-1"]);
    expect(p.legitBlocked.find((c) => c.id === "h-pad-1")?.why).toBe("ERROR truncated");
    expect(report.heldout.atRegister.thresholds).toEqual(register);
  });

  it("says plainly whether the F38 floor is met and by how much it is missed", () => {
    expect(report.heldout.f38.met).toBe(false);
    expect(report.heldout.f38.shortBy).toBeCloseTo(0.9 - 1 / 3, 9);
  });

  it("keeps every variant with its rank, and the winner the run decided", () => {
    expect(report.variants.map((v) => v.id)).toEqual(["v0", "v1"]);
    expect(report.winner).toBe("v1");
    expect(report.variants.find((v) => v.id === "v1")?.rank).toBe(1);
  });

  it("gives the R10 outcome of each demo listing, live and recorded", () => {
    expect(report.anchors.map((a) => [a.name, a.liveOutcome])).toEqual([
      ["injected-tee", "DENY"],
      ["apparel-tee", "APPROVE"],
    ]);
  });

  it("compares plain and window judging of the long cases", () => {
    expect(report.windows).toEqual([expect.objectContaining({ id: "h-pad-1", split: "held-out", plain: "ESCALATE", windowed: "APPROVE", label: "legit" })]);
  });
});

describe("renderTuneMarkdown", () => {
  const markdown = renderTuneMarkdown(buildTuneReport(run));

  it("passes the document rules (docs-check port)", () => {
    expect(docsLint(markdown)).toEqual([]);
  });

  it("states the F38 result, every variant and the window decision", () => {
    expect(markdown).toContain("Not met: short by");
    expect(markdown).toContain("| v0 |");
    expect(markdown).toContain("| v1 |");
    expect(markdown).toContain("windows stay OFF");
  });
});

describe("buildProposal", () => {
  const proposal = buildProposal(buildTuneReport(run), { generatedAt: "2026-10-02T15:05:00.000Z", modelRevision: "55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851" });

  it("has the shape the lead asked for", () => {
    expect(Object.keys(proposal)).toEqual(["generated_at", "model_revision", "wording_variant", "tuning_n", "heldout_n", "thresholds", "objective", "heldout_results", "caveats"]);
    expect(Object.keys(proposal.thresholds)).toEqual(["t_inj", "t_sell_deny", "t_sell_esc", "t_scope", "t_esc"]);
    expect([proposal.tuning_n, proposal.heldout_n]).toEqual([4, 5]);
  });

  it("proposes no T_esc when escalate_or_proceed carries no signal", () => {
    expect(proposal.thresholds.t_esc).toBeNull();
    expect(proposal.caveats.length).toBeGreaterThan(3);
  });
});
