// The two zeros on the Evidence screen count different things: the overspend figure counts every scenario the run drew,
// target T-H1 counts only the deterministic ones. Under the overspend figure a short plain line says so, in both
// languages, with both counts read from the loaded result and every number wearing its chip.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dm8View } from "../src/evidence/components/PresenterBeats";
import { parseHarnessFile } from "../src/evidence/harnessGuard";
import type { HarnessRun } from "../src/evidence/types";
import { EvidenceScreen } from "../src/screens/EvidenceScreen";
import { LocaleProvider, type Locale } from "../src/ui/locale";
import { bootApp } from "./helpers/app";
import { CLEAN, honestyProblems } from "./evidenceFigures";
import { harnessFile, rate } from "./evidenceFixtures";

type Json = Record<string, unknown>;

function run(raw: Json): HarnessRun {
  const parsed = parseHarnessFile("harness-1-live.json", raw);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  return parsed.value;
}

/** The synthetic file with B2's overspend count and T-H1's count set, and everything else as the default. */
function file(b2: Json | null, th1: Json | null): Json {
  const raw = harnessFile();
  const baselines = raw["baselines"] as Record<string, Json>;
  const b2Rates = Object.fromEntries(Object.entries(baselines["B2"] ?? {}).filter(([key]) => b2 !== null || key !== "overspend_rate"));
  return {
    ...raw,
    baselines: { ...baselines, B2: b2 === null ? b2Rates : { ...b2Rates, overspend_rate: b2 } },
    acceptance: th1 === null ? [] : [{ id: "T-H1", target: "no over-limit mint or charge in the deterministic scenarios [F38]", evaluated_on: "B2", result: th1, pass: true }],
  };
}

function show(locale: Locale, r: HarnessRun): HTMLElement {
  return render(
    <LocaleProvider locale={locale}>
      <EvidenceScreen harness={{ items: [r], unreadable: [] }} />
    </LocaleProvider>,
  ).container;
}

const note = (root: ParentNode): Element | null => root.querySelector('[data-big="overspend_rate"] [data-scope-note]');

describe("the overspend figure says what its count and the target's count each cover", () => {
  it("reads both counts from the loaded result", () => {
    const c = show("en", run(file(rate(2, 20), rate(0, 16))));
    expect(note(c)).toHaveTextContent("B2 overspent in 2 of 20 scenarios. Target T-H1 counts only the 16 deterministic ones.");
    const other = show("en", run(file(rate(0, 40), rate(0, 31))));
    expect(note(other)).toHaveTextContent("B2 overspent in 0 of 40 scenarios. Target T-H1 counts only the 31 deterministic ones.");
  });

  it("sits under the figures, inside the card, and only on the overspend card", () => {
    const c = show("en", run(file(rate(0, 20), rate(0, 16))));
    const card = c.querySelector('[data-big="overspend_rate"]')!;
    expect(card.querySelectorAll("[data-scope-note]")).toHaveLength(1);
    expect(c.querySelectorAll("[data-scope-note]")).toHaveLength(1);
    const rows = card.querySelectorAll(".ev-big__row");
    const last = rows[rows.length - 1]!;
    expect(last.compareDocumentPosition(note(card)!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.querySelector(".ev-verdicts")!.compareDocumentPosition(note(card)!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("every number in it wears the chip of the count it came from, and the page stays honest", () => {
    const c = show("en", run(file(rate(0, 20), rate(0, 16))));
    const nums = note(c)!.querySelectorAll("[data-num]");
    expect(nums).toHaveLength(3);
    for (const n of nums) expect(n.getAttribute("data-prov")).toBe("MEASURED");
    expect(honestyProblems(c)).toEqual(CLEAN);
    // The card's chip row already shows the shared chip, so the numbers do not repeat it; a count with a chip of its own does.
    expect(note(c)!.querySelectorAll("[data-chip]")).toHaveLength(0);
    const own = show("en", run(file(rate(0, 20), rate(0, 16, "MEASURED(n=16, seed=1, commit=abcdef1)"))));
    expect(note(own)!.querySelectorAll("[data-chip]")).toHaveLength(1);
    expect(note(own)!.querySelector("[data-chip]")).toHaveTextContent("MEASURED(n=16, seed=1, commit=abcdef1)");
    expect(honestyProblems(own)).toEqual(CLEAN);
  });

  it("says it in 繁, marked zh-HK, with the same numbers", () => {
    const c = show("zh-HK", run(file(rate(2, 20), rate(0, 16))));
    expect(note(c)).toHaveTextContent("B2 在 20 個情境中有 2 個超支。目標 T-H1 只計其中 16 個確定性情境。");
    expect(note(c)!.closest("[lang]")?.getAttribute("lang")).toBe("zh-HK");
    expect(honestyProblems(c)).toEqual(CLEAN);
  });

  it("is left out when there is nothing to reconcile: same count, no T-H1 row, or no B2 figure", () => {
    expect(note(show("en", run(file(rate(0, 20), rate(0, 20)))))).toBeNull();
    document.body.innerHTML = "";
    expect(note(show("en", run(file(rate(0, 20), null))))).toBeNull();
    document.body.innerHTML = "";
    expect(note(show("en", run(file(null, rate(0, 16)))))).toBeNull();
  });

  it("shows on the presenter's big-number view too", () => {
    const { container } = render(<Dm8View harness={{ items: [run(file(rate(0, 20), rate(0, 16)))], unreadable: [] }} />);
    expect(note(container)).toHaveTextContent("B2 overspent in 0 of 20 scenarios. Target T-H1 counts only the 16 deterministic ones.");
    expect(honestyProblems(container)).toEqual(CLEAN);
  });

  it("holds on the committed result files, whatever their counts are", async () => {
    await bootApp("#/evidence");
    const text = note(document.body)?.textContent ?? "";
    expect(text).toMatch(/^B2 overspent in \d+ of \d+ scenarios\. Target T-H1 counts only the \d+ deterministic ones\.$/);
    const [, k, n, m] = /in (\d+) of (\d+) scenarios.*the (\d+) deterministic/.exec(text) ?? [];
    expect(Number(k)).toBeLessThanOrEqual(Number(n));
    expect(Number(m)).toBeLessThan(Number(n));
  });
});
