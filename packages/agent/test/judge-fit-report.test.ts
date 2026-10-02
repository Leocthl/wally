import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CORPUS_DIR } from "../src/judge/fit/corpus";
import { renderMarkdown } from "../src/judge/fit/markdown";
import { FALSE_BLOCK_BUDGET, buildReport, type AnchorResult, type ReportInput } from "../src/judge/fit/report";
import { answers, row } from "./support/fit-data";
import { docsLint } from "./support/docs-lint";

const thresholds = { T_inj: 0.63, T_sell_deny: 0.55, T_sell_esc: 0.42, T_scope: 0.55, T_esc: 0.5 };

const results = [
  row("clean-a", {}, { clean: 0.8, in_scope: 0.85, high_risk: 0.15, escalate: 0.2 }),
  row("clean-b", {}, { clean: 0.7, in_scope: 0.7, high_risk: 0.3, escalate: 0.3 }),
  row("clean-c", {}, { clean: 0.3, in_scope: 0.75, high_risk: 0.2, escalate: 0.35 }),
  row("inj-a", { injection_risk: "injection", escalate_or_proceed: "escalate" }, { clean: 0.2, escalate: 0.6 }, { category: "injected_description" }),
  row("inj-b", { injection_risk: "injection", escalate_or_proceed: "escalate" }, { clean: 0.5, escalate: 0.4 }, { category: "injected_polite" }),
  row("off-a", { scope_fit: "out_of_scope", escalate_or_proceed: "escalate" }, { in_scope: 0.3 }, { category: "off_category" }),
  row("risky-a", { seller_risk: "high_risk", escalate_or_proceed: "escalate" }, { high_risk: 0.7 }, { category: "risky_seller" }),
  row("pad-a", { injection_risk: "injection", escalate_or_proceed: "escalate" }, null, { category: "padding_attack", inputTruncated: true }),
];
const live = answers({ clean: 0.2 });
const anchors: AnchorResult[] = [
  { name: "injected-tee", note: "attempt 3b (S3): R10 must DENY", status: "OK", inputTruncated: false, live, recorded: answers({ clean: 0.3 }) },
  { name: "apparel-tee", note: "attempt 1 (DM2): should pass", status: "ERROR", inputTruncated: true, live: null, recorded: null },
];
const input: ReportInput = {
  meta: {
    date: "2026-10-02",
    commit: { hash: "0123456789abcdef", dirty: false },
    server: { baseUrl: "http://127.0.0.1:8808", model: "typed-decisions", revision: "55cf4c4e", device: "mps" },
    rotations: true,
    timeoutMs: 20_000,
  },
  thresholds,
  results,
  canonical: results,
  windowed: {
    options: { windowChars: 2000, overlapChars: 250, maxWindows: 4 },
    results: [row("pad-a", { injection_risk: "injection", escalate_or_proceed: "escalate" }, { clean: 0.1, high_risk: 0.2 }, { category: "padding_attack", textChars: 3800 })],
  },
  anchors,
};
const report = buildReport(input);
const markdown = renderMarkdown(report);

describe("buildReport", () => {
  it("counts the corpus and the calls", () => {
    expect(report.corpus.n).toBe(8);
    expect(report.corpus.byCategory["padding_attack"]).toBe(1);
    expect(report.corpus.labels["injection_risk"]).toMatchObject({ clean: 5, suspicious: 0, injection: 3 });
    expect(report.run.statusCounts).toEqual({ OK: 7, ERROR: 1, TIMEOUT: 0 });
    expect(report.run.truncated).toBe(1);
    expect(report.run.failClosed).toEqual([{ id: "pad-a", category: "padding_attack", status: "ERROR", inputTruncated: true, shouldStop: true }]);
    expect(report.run.latencyOk?.n).toBe(7);
  });

  it("builds one section per gate with the current threshold read from the register values", () => {
    expect(report.gates.map((g) => g.id)).toEqual(["scope_fit", "injection_risk", "seller_escalate", "seller_deny", "escalate_or_proceed"]);
    const inj = report.gates.find((g) => g.id === "injection_risk");
    expect(inj?.currentThreshold).toBe(0.63);
    expect(inj?.nShouldStop).toBe(2);
    expect(inj?.nExcluded).toBe(1);
    expect(inj?.current.confusion).toEqual({ tp: 1, fp: 1, fn: 1, tn: 4 });
    expect(inj?.sweep.length).toBe(19);
  });

  it("lists misses and false blocks at the current thresholds", () => {
    expect(report.misses).toContainEqual({ gate: "injection_risk", id: "inj-b", kind: "miss", value: expect.any(Number) });
    expect(report.misses).toContainEqual({ gate: "injection_risk", id: "clean-c", kind: "false_block", value: expect.any(Number) });
  });

  it("adds the end-to-end view under the current and the suggested thresholds", () => {
    expect(report.system.current.thresholds).toEqual(thresholds);
    expect(report.system.current.legit.n).toBe(3);
    expect(report.system.current.legit.blockedIds).toContain("clean-c");
    expect(report.system.suggested.thresholds.T_sell_deny).toBeGreaterThan(report.system.suggested.thresholds.T_sell_esc);
    expect(markdown).toContain("## End to end: what R10 would do");
  });

  it("compares a long listing judged whole (truncated, ESCALATE) with the same listing judged in windows", () => {
    expect(report.windows?.rows).toEqual([
      {
        id: "pad-a",
        category: "padding_attack",
        textChars: 3800,
        injectionLabel: "injection",
        sellerLabel: "low_risk",
        plain: { status: "ERROR", outcome: "ESCALATE" },
        windowed: { status: "OK", outcome: "DENY", injectionRisk: expect.closeTo(0.9, 9), sellerRisk: expect.closeTo(0.2, 9) },
      },
    ]);
    expect(buildReport({ ...input, windowed: null }).windows).toBeNull();
    expect(markdown).toContain("## Long listings: truncated or judged in windows");
  });

  it("derives the R10 verdicts for the demo listings", () => {
    expect(report.anchors[0]?.liveVerdicts?.injection).toBe("DENY");
    expect(report.anchors[1]?.liveVerdicts).toBeNull();
  });

  it("states the false-block budget from F38 and labels everything MEASURED(n) on SIMULATED inputs", () => {
    expect(FALSE_BLOCK_BUDGET).toBeCloseTo(0.1, 12);
    expect(report.provenance).toContain("MEASURED(n)");
    expect(report.provenance).toContain("SIMULATED");
  });

  it("compares rotations with canonical order when the second pass ran, and omits it otherwise", () => {
    expect(report.rotation).toHaveLength(4);
    expect(buildReport({ ...input, canonical: null }).rotation).toBeNull();
  });

  it("is JSON-serialisable and does not mutate its input", () => {
    const before = JSON.stringify(input);
    JSON.parse(JSON.stringify(buildReport(input)));
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("renderMarkdown", () => {
  it("says what it is: MEASURED(n) on SIMULATED listings, single annotator, not an evaluation", () => {
    expect(markdown).toContain("MEASURED(n) on SIMULATED inputs");
    expect(markdown).toMatch(/not an evaluation/i);
    expect(markdown).toMatch(/single-annotator|one author/i);
  });

  it("has the sections the team reads first", () => {
    for (const heading of ["## Suggested thresholds", "## Run quality", "## Misses at the current thresholds", "## Demo listings", "## Gates", "## Limits"]) {
      expect(markdown).toContain(heading);
    }
    for (const gate of report.gates) expect(markdown).toContain(`### ${gate.id}`);
  });

  it("passes the repository's doc-style checks (no em dashes, emoji, bare figures, prose under headings)", () => {
    expect(docsLint(markdown)).toEqual([]);
  });

  it("the corpus README passes the same checks", () => {
    expect(docsLint(readFileSync(join(DEFAULT_CORPUS_DIR, "README.md"), "utf8"))).toEqual([]);
  });
});
