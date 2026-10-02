// Evidence screen: the committed result files through the real App, then synthetic variants (wiring-only, live and all
// real, missing fields, empty categories, k = 0, n = 0, k = n). Honesty scans run on every render.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parseHarnessFile } from "../src/evidence/harnessGuard";
import type { HarnessRun } from "../src/evidence/types";
import { EvidenceScreen } from "../src/screens/EvidenceScreen";
import { bootApp } from "./helpers/app";
import { CLEAN, honestyProblems } from "./evidenceFigures";
import { harnessFile, rate, wiringFile } from "./evidenceFixtures";

vi.setConfig({ testTimeout: 30_000 });

function run(raw: Record<string, unknown>, file = "harness-1-live.json"): HarnessRun {
  const parsed = parseHarnessFile(file, raw);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  return parsed.value;
}

function show(...runs: HarnessRun[]): HTMLElement {
  return render(<EvidenceScreen harness={{ items: runs, unreadable: [] }} />).container;
}

describe("Evidence screen on the committed files", () => {
  it("is reachable from the nav, shows the chosen file and why, and passes every honesty scan", async () => {
    await bootApp("#/evidence");
    expect(screen.getByRole("link", { name: /Evidence/ })).toHaveAttribute("aria-current", "page");
    expect(document.querySelector("[data-pick-reason]")?.textContent).toMatch(/Showing harness-.*\.json/);
    expect(honestyProblems(document.querySelector("main")!)).toEqual(CLEAN);
  });

  it("shows the wiring banner whenever the chosen file says it is not product evidence", async () => {
    await bootApp("#/evidence");
    const wiring = document.querySelector(".ev-harness")?.getAttribute("data-wiring");
    expect(document.querySelector("[data-wiring-banner]") !== null).toBe(wiring === "true");
  });
});

describe("Evidence screen, synthetic runs", () => {
  it("wiring-only: banner above the charts with the file's reasons, a stamp on every chart", () => {
    const c = show(run(wiringFile()));
    const banner = screen.getByRole("region", { name: /Wiring check, not product evidence yet/ });
    expect(banner).toHaveTextContent("engine: a stand-in is not the real implementation");
    const charts = c.querySelectorAll("figure.ev-chart");
    expect(charts.length).toBeGreaterThan(0);
    for (const chart of charts) expect(chart.querySelector("[data-wiring-stamp]")).not.toBeNull();
    expect(banner.compareDocumentPosition(charts[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(honestyProblems(c)).toEqual(CLEAN);
  });

  it("live and all real: no banner, no stamps, and the caption says why it was chosen", () => {
    const c = show(run(harnessFile()));
    expect(c.querySelector("[data-wiring-banner]")).toBeNull();
    expect(c.querySelector("[data-wiring-stamp]")).toBeNull();
    expect(c.querySelector('[data-pick-reason="live-all-real"]')).toHaveTextContent("Newest live run whose components are all real.");
  });

  it("absent flags: wiring banner that says the components are not confirmed real", () => {
    const raw = harnessFile();
    const bare = Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "components" && k !== "evidence"));
    show(run(bare));
    expect(screen.getByRole("region", { name: /Wiring check/ })).toHaveTextContent("Components not confirmed real");
  });

  it("draws B0, B1, B2 in that order with k/n, percentage and interval in one chipped figure", () => {
    const c = show(run(harnessFile()));
    const chart = c.querySelector('figure[data-metric="overspend_rate"]')!;
    expect([...chart.querySelectorAll(".ev-bar")].map((b) => b.getAttribute("data-baseline"))).toEqual(["B0", "B1", "B2"]);
    expect(chart.querySelector('[data-baseline="B0"] .num__v')).toHaveTextContent("4/20 · 20.0% · CI 8.1 to 41.6%");
    const img = within(chart as HTMLElement).getByRole("img");
    expect(img.getAttribute("aria-label")).toContain("B0 model-only gate: 4 of 20, 20.0%");
    expect(img.getAttribute("aria-label")).toContain("MEASURED(n=20, seed=1, commit=abcdef1)");
  });

  it("states where B2 is worse as prominently as where it wins", () => {
    const c = show(run(harnessFile()));
    const injection = c.querySelector('figure[data-metric="injection_pass_through_rate"]')!;
    expect(injection.querySelector('[data-verdict="better"][data-against="B1"]')).toHaveTextContent("B2 better here");
    const latency = c.querySelector('figure[data-metric="latency"]')!;
    const worse = latency.querySelector('[data-verdict="worse"]');
    expect(worse).toHaveTextContent("B2 worse here");
    expect(worse?.className).toContain("ev-verdict");
  });

  it("k = 0, k = n and n = 0: zero and full bars, and no percentage without a denominator", () => {
    const raw = harnessFile();
    const b = raw["baselines"] as Record<string, Record<string, unknown>>;
    const c = show(run({ ...raw, baselines: { ...b, B0: { ...b["B0"], overspend_rate: rate(0, 0) }, B1: { ...b["B1"], overspend_rate: rate(20, 20) }, B2: { ...b["B2"], overspend_rate: rate(0, 20) } } }));
    const chart = c.querySelector('figure[data-metric="overspend_rate"]')!;
    expect(chart.querySelector('[data-baseline="B0"]')).toHaveTextContent("0/0");
    expect(chart.querySelector('[data-baseline="B0"]')).toHaveTextContent("no cases, so no rate");
    expect(chart.querySelector('[data-baseline="B0"]')?.textContent).not.toMatch(/%/);
    expect(chart.querySelector('[data-baseline="B1"] .num__v')).toHaveTextContent("20/20 · 100.0% · CI 83.9 to 100.0%");
    expect(chart.querySelector('[data-baseline="B2"] .num__v')).toHaveTextContent("0/20 · 0.0% · CI 0.0 to 16.1%");
    expect(chart.querySelector('[data-verdict="none"][data-against="B0"]')).not.toBeNull();
    expect(honestyProblems(c)).toEqual(CLEAN);
  });

  it("a recorded run shows latency as not measured, with no millisecond figure", () => {
    const raw = harnessFile({ mode: "recorded" });
    const b = raw["baselines"] as Record<string, Record<string, unknown>>;
    const notMeasured = { measured: false, note: "not measured: replayed", chip: "RECORDED(n=20, seed=1, commit=abcdef1)" };
    const c = show(run({ ...raw, baselines: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, { ...v, latency: notMeasured }])) }));
    const latency = c.querySelector('figure[data-metric="latency"]')!;
    expect(latency).toHaveTextContent("not measured in this run");
    expect(latency.textContent).not.toMatch(/\d+ ms/);
  });

  it("acceptance: a miss says MISSED and by how much; the target wears an ASSUMED chip", () => {
    const raw = harnessFile({ acceptance: [{ id: "T-H2", target: "t", evaluated_on: "B2", result: rate(0, 66), pass: false }] });
    const c = show(run(raw));
    const row = c.querySelector('[data-acceptance="T-H2"]')!;
    expect(row).toHaveTextContent("MISSED");
    expect(row).toHaveTextContent("more approvals needed to reach the target");
    expect(row.querySelector(".ev-acc__short .num__v")).toHaveTextContent("60");
    expect(row.querySelector('.ev-acc__target [data-prov="ASSUMED"]')).toHaveTextContent("90%");
    expect(honestyProblems(c)).toEqual(CLEAN);
  });

  it("an unreadable file gets a panel in words and no figure at all", () => {
    const { container } = render(<EvidenceScreen harness={{ items: [], unreadable: [{ file: "harness-9-live.json", problems: ["the baselines block is missing"] }] }} />);
    expect(screen.getByRole("region", { name: /This result file could not be read/ })).toHaveTextContent("the baselines block is missing");
    expect(screen.getByText("No harness result could be read, so no figure is shown.")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-num]")).toHaveLength(0);
  });

  it("lists every rate in the all-metrics table, including keys the page does not know", () => {
    const raw = harnessFile();
    const b = raw["baselines"] as Record<string, Record<string, unknown>>;
    const c = show(run({ ...raw, baselines: { ...b, B2: { ...b["B2"], refund_rate: rate(1, 9) } } }));
    const table = screen.getByRole("table");
    expect(c.querySelector('figure[data-metric="refund_rate"]')).toBeNull();
    expect(table.querySelector('tr[data-metric="refund_rate"]')).toHaveTextContent("1/9");
  });

  it("lets a visitor switch runs by keyboard and says the choice was theirs", async () => {
    const user = userEvent.setup();
    const c = show(run(harnessFile(), "harness-2-live.json"), run(harnessFile({ mode: "recorded" }), "harness-2-recorded.json"));
    const select = screen.getByRole("combobox", { name: /Result file/ });
    await user.tab();
    expect(select).toHaveFocus();
    await user.selectOptions(select, "harness-2-recorded.json");
    expect(c.querySelector("[data-pick-reason]")).toHaveTextContent("Showing harness-2-recorded.json");
    expect(c.querySelector('[data-pick-reason="visitor"]')).toHaveTextContent("Chosen by the visitor.");
  });
});
