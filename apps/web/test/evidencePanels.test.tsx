// Panels below the charts: per-category (collapsed), the legitimate scenarios B2 blocked, the judge fit with its limits,
// and the human files (manual route E3, captures E5) in pending, partial and complete states.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryPanel } from "../src/evidence/components/CategoryPanel";
import { CapturesPanel, ManualRoutePanel } from "../src/evidence/components/HumanPanels";
import { JudgePanel } from "../src/evidence/components/JudgePanel";
import { loadJudgeFits } from "../src/evidence/data";
import { parseHarnessFile } from "../src/evidence/harnessGuard";
import { meetsSample, parseCaptures, parseManualRoute, spread } from "../src/evidence/humanGuard";
import { parseJudgeFit } from "../src/evidence/judgeFitGuard";
import type { HarnessRun } from "../src/evidence/types";
import { CLEAN, honestyProblems } from "./evidenceFigures";
import { harnessFile } from "./evidenceFixtures";

const run = (raw: Record<string, unknown>): HarnessRun => {
  const p = parseHarnessFile("h.json", raw);
  if (!p.ok) throw new Error(p.problems.join("; "));
  return p.value;
};

describe("CategoryPanel", () => {
  it("is collapsed by default and lists per-baseline k/n per category", () => {
    const { container } = render(<CategoryPanel run={run(harnessFile())} />);
    const details = container.querySelector('details[data-panel="categories"]') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const row = container.querySelector('tr[data-category="within_budget"]')!;
    expect(row).toHaveTextContent("5/6");
    expect(row).toHaveTextContent("6/6");
    expect(honestyProblems(container)).toEqual(CLEAN);
  });

  it("says so when the file lists no categories", () => {
    render(<CategoryPanel run={run(harnessFile({ categories: [] }))} />);
    expect(screen.getByText("This file lists no categories.")).toBeInTheDocument();
  });

  it("lists the legitimate scenarios B2 blocked, with the rule and the gate", () => {
    const { container } = render(<CategoryPanel run={run(harnessFile())} />);
    const list = container.querySelector("[data-blocked-list]")!;
    expect(list.querySelectorAll("tbody tr")).toHaveLength(1);
    const row = list.querySelector('[data-scenario-id="s-01"]')!;
    expect(row).toHaveTextContent("DENY R10");
    expect(row).toHaveTextContent("judge");
  });

  it("says when a file carries no per-scenario rows, or when nothing was blocked", () => {
    const noRows = Object.fromEntries(Object.entries(harnessFile()).filter(([k]) => k !== "scenarios"));
    const { unmount } = render(<CategoryPanel run={run(noRows)} />);
    expect(screen.getByText(/carries no per-scenario rows/)).toBeInTheDocument();
    unmount();
    render(<CategoryPanel run={run(harnessFile({ scenarios: [] }))} />);
    expect(screen.getByText(/B2 completed every legitimate scenario/)).toBeInTheDocument();
  });
});

describe("JudgePanel", () => {
  it("shows the verdict, per-gate k/n, the six demo listings and the limits from the committed report", () => {
    const fit = loadJudgeFits().items[0] ?? null;
    const { container } = render(<JudgePanel fit={fit} corpus={null} />);
    const panel = screen.getByRole("region", { name: /Judge on invented listings/ });
    expect(panel).toHaveTextContent("not a general accuracy");
    expect(container.querySelector("[data-judge-verdict]")).not.toBeNull();
    expect(container.querySelectorAll("[data-gates] tbody tr").length).toBe(fit?.evaluated.gates.length);
    expect(container.querySelectorAll("[data-listings] tbody tr").length).toBe(fit?.listings.length);
    const limits = within(panel).getByRole("region", { name: /Limits/ });
    for (const text of ["SIMULATED corpus", "One annotator", "Chinese input is weak"]) expect(limits).toHaveTextContent(text);
    expect(honestyProblems(container)).toEqual(CLEAN);
  });

  it("refuses a report without the end-to-end view and shows no judge figure", () => {
    expect(parseJudgeFit("j.json", { schema: "judge-fit/v1", meta: { date: "2026-10-02" }, corpus: { n: 3 } }).ok).toBe(false);
    const { container } = render(<JudgePanel fit={null} corpus={null} />);
    expect(screen.getByText(/No judge-fit report could be read/)).toBeInTheDocument();
    expect(container.querySelectorAll("[data-num]")).toHaveLength(0);
  });
});

const runRow = (id: string, runner: string, extra: Record<string, unknown> = {}) => ({ id, runner, at_utc8: "2026-10-03T10:05:00+08:00", tag: "OBSERVED", steps: 12, decide_s: 40, issue_s: 30, payment_completed: false, ...extra });
const manual = (mRuns: unknown[], aRuns: unknown[]) => ({ schema: "laisee.evidence.manual-route/v1", status: "partial", routes: [{ id: "M", label: "by hand", runs: mRuns }, { id: "A", label: "agent", runs: aRuns }] });

describe("Manual route (E3)", () => {
  it("pending template: says pending and shows no figure", async () => {
    const template = (await import("@evidence-data/manual-route.json")).default;
    const { container } = render(<ManualRoutePanel parsed={parseManualRoute(template)} />);
    expect(container.querySelectorAll("[data-pending]").length).toBeGreaterThan(0);
    expect(container).toHaveTextContent("pending: not captured yet");
    expect(container.querySelectorAll("[data-num]")).toHaveLength(0);
  });

  it("partial: rows with OBSERVED chips, below the planned sample, median over OBSERVED rows only", () => {
    const parsed = parseManualRoute(manual([runRow("M-01", "AB"), runRow("M-02", "AB", { decide_s: 60, tag: "SIMULATED" })], []));
    const { container } = render(<ManualRoutePanel parsed={parsed} />);
    const m = container.querySelector('[data-route-id="M"]')!;
    expect(m).toHaveTextContent("Below the planned sample");
    expect(m.querySelector('[data-run="M-01"] [data-prov="OBSERVED"]')).toHaveTextContent("OBSERVED(2026-10-03 10:05 UTC+8, run M-01 by AB)");
    expect(m.querySelector('[data-run="M-02"] [data-prov="SIMULATED"]')).not.toBeNull();
    expect(m.querySelector("[data-summary]")).toHaveTextContent("MEASURED(n=1)");
    expect(container.querySelector('[data-route-id="A"] [data-pending]')).not.toBeNull();
    expect(honestyProblems(container)).toEqual(CLEAN);
  });

  it("complete: the sample rule holds; route A's issue step is SIMULATED", () => {
    const m = [runRow("M-01", "AB"), runRow("M-02", "CD", { decide_s: 50 }), runRow("M-03", "AB", { decide_s: 44 })];
    const a = [1, 2, 3].map((i) => runRow(`A-0${i}`, i === 2 ? "CD" : "AB", { decide_s: 5, issue_s: 1, issue_tag: "SIMULATED" }));
    const parsed = parseManualRoute(manual(m, a));
    if (!parsed.ok) throw new Error("parse");
    expect(parsed.value.routes.every(meetsSample)).toBe(true);
    const { container } = render(<ManualRoutePanel parsed={parsed} />);
    expect(container.querySelector('[data-route-id="M"] [data-summary]')).toHaveTextContent("44 (40 to 50)");
    expect(container.querySelector('[data-route-id="A"] [data-summary] td:last-child [data-prov]')?.getAttribute("data-prov")).toBe("SIMULATED");
  });

  it("drops a run that completed a payment or lacks a time, and counts it", () => {
    const parsed = parseManualRoute(manual([runRow("M-01", "AB", { payment_completed: true }), runRow("M-02", "AB", { at_utc8: "soon" })], []));
    expect(parsed.ok && parsed.value.droppedRows).toBe(2);
    expect(spread([3, 1, 2, 10])).toEqual({ n: 4, median: 2.5, min: 1, max: 10 });
  });
});

describe("Captures (E5)", () => {
  it("pending template: no capture and no real decline yet, in words", async () => {
    const template = (await import("@evidence-data/captures.json")).default;
    const { container } = render(<CapturesPanel parsed={parseCaptures(template)} />);
    expect(container).toHaveTextContent("pending: not captured yet");
    expect(container).toHaveTextContent("the real-card test has not been run");
    expect(container.querySelectorAll("[data-num]")).toHaveLength(0);
  });

  it("filled: each value wears OBSERVED with time and capturer; the decline shows its code and one-sample time", () => {
    const parsed = parseCaptures({
      schema: "laisee.evidence.captures/v1",
      status: "partial",
      captures: [{ id: "C01", register_row: "F3", what: "dispute fee on the charges page", value_seen: "HK$150 per transaction", captured_at_utc8: "2026-10-03T11:00:00+08:00", captured_by: "AB", redacted_file: null }],
      real_decline: { captured_at_utc8: "2026-10-03T12:00:00+08:00", decline_code: "51", message: "Declined", where: "checkout page", seconds_to_decline: 2.4, redacted_file: "data/captures/decline.png" },
    });
    const { container } = render(<CapturesPanel parsed={parsed} />);
    expect(container.querySelector('[data-capture="C01"] [data-prov="OBSERVED"]')).toHaveTextContent("OBSERVED(2026-10-03 11:00 UTC+8, C01 by AB)");
    const decline = container.querySelector("[data-real-decline]")!;
    expect(decline).toHaveTextContent("51");
    expect(decline).toHaveTextContent("MEASURED(n=1)");
    expect(honestyProblems(container)).toEqual(CLEAN);
  });

  it("an unreadable file says so and shows nothing from it", () => {
    const { container } = render(<CapturesPanel parsed={parseCaptures({ schema: "other" })} />);
    expect(container).toHaveTextContent("could not be read");
    expect(container.querySelectorAll("[data-num]")).toHaveLength(0);
  });
});
