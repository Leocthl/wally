// Judge-fit reports v1 and v2: the guard, the choice of report, and the panel in its reading order (verdict, before and
// after, per gate with the seller note, demo listings, every variant, limits). Counts come from the file, never typed.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JudgePanel } from "../src/evidence/components/JudgePanel";
import { loadJudgeFits } from "../src/evidence/data";
import type { JudgeFit } from "../src/evidence/judgeFit";
import { newestFitFirst, parseJudgeFit } from "../src/evidence/judgeFitGuard";
import { CLEAN, honestyProblems } from "./evidenceFigures";
import { judgeFitV1, judgeFitV2 } from "./evidenceFixtures";

function fit(raw: Record<string, unknown>, file = "judge-fit-x.json"): JudgeFit {
  const p = parseJudgeFit(file, raw);
  if (!p.ok) throw new Error(p.problems.join("; "));
  return p.value;
}

const order = (c: Element, selectors: readonly string[]): boolean =>
  selectors.every((s, i) => i === 0 || (c.querySelector(selectors[i - 1] as string)!.compareDocumentPosition(c.querySelector(s)!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);

describe("parseJudgeFit", () => {
  it("reads v2: held-out counts at proposed and at register thresholds, variants, listings, latency", () => {
    const f = fit(judgeFitV2());
    expect(f.schema).toBe("judge-fit/v2");
    expect(f.evaluated.approvals).toEqual({ legit: { k: 35, n: 47 }, injected: { k: 2, n: 14 }, highRisk: { k: 0, n: 11 }, outOfScope: { k: 0, n: 10 } });
    expect(f.baseline?.approvals.legit).toEqual({ k: 30, n: 47 });
    expect(f.chip.text).toBe("MEASURED(n=81 held-out, 2026-10-02, commit=0481e33)");
    expect(f.tuningChip?.text).toBe("MEASURED(n=83 tuning, 2026-10-02, commit=0481e33)");
    expect(f.variants.map((v) => [v.id, v.chosen])).toEqual([["v0", false], ["v5", true]]);
    expect(f.unfitted).toEqual(["T_esc"]);
    expect(f.latency).toMatchObject({ n: 75, p50: 208, p95: 287.3 });
  });

  it("still reads v1, with no baseline and no variants", () => {
    const f = fit(judgeFitV1());
    expect(f.schema).toBe("judge-fit/v1");
    expect(f.evaluated.approvals.legit).toEqual({ k: 19, n: 27 });
    expect(f.evaluated.approvals.injected).toEqual({ k: 4, n: 31 });
    expect(f.evaluated.gates[0]).toMatchObject({ id: "scope_fit", recall: { k: 5, n: 10 }, falseBlock: { k: 2, n: 62 } });
    expect(f.baseline).toBeNull();
    expect(f.variants).toEqual([]);
  });

  it("tolerates missing optional parts of v2", () => {
    const raw = judgeFitV2();
    const heldout = raw["heldout"] as Record<string, unknown>;
    const f = fit({ ...raw, variants: undefined, anchors: undefined, escalate: undefined, heldout: { atProposed: heldout["atProposed"] } });
    expect(f.baseline).toBeNull();
    expect(f.variants).toEqual([]);
    expect(f.listings).toEqual([]);
    expect(f.latency).toBeNull();
  });

  it("refuses a report without the held-out result, the split size or the date, in words", () => {
    const raw = judgeFitV2();
    for (const broken of [{ ...raw, heldout: {} }, { ...raw, split: {} }, { ...raw, meta: {} }]) {
      const p = parseJudgeFit("j.json", broken);
      expect(p.ok).toBe(false);
      if (!p.ok) expect(p.problems.join(" ")).toMatch(/held-out|date/);
    }
    expect(parseJudgeFit("j.json", { ...raw, schema: "judge-fit/v3" }).ok).toBe(false);
    expect(parseJudgeFit("j.json", null).ok).toBe(false);
  });

  it("drops a count whose k is above n instead of guessing", () => {
    const raw = judgeFitV2();
    const heldout = raw["heldout"] as Record<string, Record<string, unknown>>;
    const atProposed = { ...heldout["atProposed"], highRiskApproved: { k: 12, n: 11 } };
    expect(fit({ ...raw, heldout: { ...heldout, atProposed } }).evaluated.approvals.highRisk).toBeNull();
  });

  it("picks the newest by date and prefers v2 on the same date", () => {
    const v1 = fit(judgeFitV1(), "judge-fit-a.json");
    const v2 = fit(judgeFitV2(), "judge-fit-b.json");
    expect([v1, v2].sort(newestFitFirst)[0]?.schema).toBe("judge-fit/v2");
    const laterV1 = fit(judgeFitV1({ meta: { date: "2026-10-03" } }), "judge-fit-c.json");
    expect([v2, laterV1].sort(newestFitFirst)[0]?.file).toBe("judge-fit-c.json");
  });
});

describe("JudgePanel on judge-fit v2", () => {
  it("leads with a verdict computed from the file, then the sections in order, all honest", () => {
    const f = loadJudgeFits().items[0]!;
    const { container } = render(<JudgePanel fit={f} corpus={null} />);
    const verdict = container.querySelector("[data-judge-verdict]")!;
    const { legit, injected } = f.evaluated.approvals;
    expect(verdict).toHaveTextContent(`${legit.k}/${legit.n}`);
    expect(verdict).toHaveTextContent(`${injected.k}/${injected.n}`);
    const met = legit.k * 100 >= legit.n * 90;
    expect(verdict).toHaveTextContent(met ? "target [F38] is met." : "target [F38] is not met.");
    expect(order(container, ["[data-judge-verdict]", "[data-before-after]", "[data-gates]", "[data-listings]", "[data-judge-limits]"])).toBe(true);
    expect(container.querySelectorAll("[data-gates] tbody tr")).toHaveLength(f.evaluated.gates.length);
    expect(container.querySelectorAll("[data-listings] tbody tr")).toHaveLength(f.listings.length);
    expect(honestyProblems(container)).toEqual(CLEAN);
  });

  it("before and after: four measures, register thresholds against fitted ones, each k/n with an interval", () => {
    const { container } = render(<JudgePanel fit={fit(judgeFitV2())} corpus={null} />);
    const table = container.querySelector("[data-before-after]")!;
    expect([...table.querySelectorAll("tr[data-measure]")].map((r) => r.getAttribute("data-measure"))).toEqual(["legit", "injected", "highRisk", "outOfScope"]);
    const legit = table.querySelector('tr[data-measure="legit"]')!;
    expect(legit.querySelectorAll(".num__v")[0]).toHaveTextContent("30/47 · 63.8% · CI 49.5 to 76.0%");
    expect(legit.querySelectorAll(".num__v")[1]).toHaveTextContent("35/47 · 74.5% · CI 60.5 to 84.7%");
    expect(table.querySelector('tr[data-threshold="T_inj"] td:last-child [data-prov]')?.getAttribute("data-prov")).toBe("MEASURED");
    expect(table.querySelector('tr[data-threshold="T_esc"] td:last-child [data-prov]')?.getAttribute("data-prov")).toBe("ASSUMED");
  });

  it("says plainly that the seller gate stopped none and what stops risky sellers", () => {
    render(<JudgePanel fit={fit(judgeFitV2())} corpus={null} />);
    const note = document.querySelector("[data-seller-note]")!;
    expect(note).toHaveTextContent("The seller gate stopped 0/10");
    expect(note).toHaveTextContent("risky sellers are stopped by R9");
    expect(note).toHaveTextContent("The seller threshold stops none on its own.");
  });

  it("lists every wording variant and marks the chosen one, and states the v2 limits", () => {
    const { container } = render(<JudgePanel fit={fit(judgeFitV2())} corpus={null} />);
    expect(container.querySelectorAll("[data-variants] tbody tr")).toHaveLength(2);
    expect(container.querySelectorAll('[data-variants] tr[data-chosen="true"]')).toHaveLength(1);
    const limits = screen.getByRole("region", { name: /Limits/ });
    for (const text of ["SIMULATED corpus", "One annotator", "fixed by a hash rule before any run", "Chinese input is weak", "Intervals are wide", "shared machine", "not a benchmark"]) expect(limits).toHaveTextContent(text);
    expect(honestyProblems(container)).toEqual(CLEAN);
  });

  it("flags a file whose own target verdict disagrees with its counts", () => {
    const raw = judgeFitV2();
    const heldout = raw["heldout"] as Record<string, unknown>;
    render(<JudgePanel fit={fit({ ...raw, heldout: { ...heldout, f38: { floor: 0.9, met: true } } })} corpus={null} />);
    expect(screen.getByText(/disagrees with its counts/)).toBeInTheDocument();
  });
});

describe("JudgePanel on judge-fit v1", () => {
  it("shows the thresholds in force, says fit and test were the same cases, and has no variants table", () => {
    const { container } = render(<JudgePanel fit={fit(judgeFitV1())} corpus={null} />);
    expect(container.querySelector("[data-judge-verdict]")).toHaveTextContent("At the thresholds in force the judge approves 19/27");
    expect(container).toHaveTextContent("Fit and test were the same cases in this report.");
    expect(container.querySelector("[data-variants]")).toBeNull();
    expect(container.querySelector("[data-seller-note]")).toBeNull();
    expect(screen.getByRole("region", { name: /Limits/ })).toHaveTextContent("Fit and test are the same cases");
    expect(honestyProblems(container)).toEqual(CLEAN);
  });
});
