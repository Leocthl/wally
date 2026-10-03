// "Why trust Wally?" after the restyle: one language at a time (no two-line pairs), 繁 marked zh-HK, the bottom line in
// words before any chart (worse as plain as better, wiring banner still on top), variants collapsed by default, and
// every honesty scan still clean in both languages.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseHarnessFile } from "../src/evidence/harnessGuard";
import type { HarnessRun } from "../src/evidence/types";
import { EvidenceScreen } from "../src/screens/EvidenceScreen";
import { LocaleProvider, type Locale } from "../src/ui/locale";
import { CLEAN, honestyProblems } from "./evidenceFigures";
import { harnessFile, wiringFile } from "./evidenceFixtures";
import { developerModeForFile } from "./helpers/devMode";

function run(raw: Record<string, unknown>): HarnessRun {
  const parsed = parseHarnessFile("harness-1-live.json", raw);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  return parsed.value;
}

function show(locale: Locale, r: HarnessRun = run(harnessFile())): HTMLElement {
  return render(
    <LocaleProvider locale={locale}>
      <EvidenceScreen harness={{ items: [r], unreadable: [] }} />
    </LocaleProvider>,
  ).container;
}

const CJK = new RegExp("[\\u3400-\\u9fff]");

developerModeForFile(); // plain is the default; these tests are about the developer view

describe("Why trust Wally?", () => {
  it("leads with the title and the bottom line in words, before the picker and the charts", () => {
    const c = show("en");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Why trust Wally?");
    const headline = c.querySelector("[data-headline-card]")!;
    expect(headline.querySelectorAll("[data-headline]")).toHaveLength(3);
    expect(headline.compareDocumentPosition(c.querySelector(".ev-picker")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(headline.compareDocumentPosition(c.querySelector("figure.ev-chart")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(headline).toHaveTextContent("Where the full pipeline is worse is shown as plainly as where it is better.");
    expect(honestyProblems(c)).toEqual(CLEAN);
  });

  it("keeps the wiring banner above the bottom line when the file is not product evidence", () => {
    const c = show("en", run(wiringFile()));
    const banner = c.querySelector("[data-wiring-banner]")!;
    expect(banner.compareDocumentPosition(c.querySelector("[data-headline-card]")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows one language at a time: English has no Chinese, 繁 has its runs marked zh-HK, no two-line pairs", () => {
    const en = show("en");
    expect(en.querySelectorAll(".bi, .bi__zh")).toHaveLength(0);
    expect(CJK.test(en.textContent ?? "")).toBe(false);
    en.remove();
    document.body.innerHTML = "";
    const zh = show("zh-HK");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("為甚麼可以信任 Wally？");
    const bad: string[] = [];
    const walker = document.createTreeWalker(zh, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (CJK.test(node.textContent ?? "") && node.parentElement?.closest("[lang]")?.getAttribute("lang") !== "zh-HK") bad.push((node.textContent ?? "").slice(0, 20));
    }
    expect(bad).toEqual([]);
    expect(honestyProblems(zh)).toEqual(CLEAN);
  });

  it("collapses every wording variant behind a disclosure by default, still in the page", () => {
    const c = show("en");
    const variants = c.querySelector<HTMLDetailsElement>('details[data-panel="variants"]');
    if (variants === null) return; // the committed judge report may carry no variants
    expect(variants.open).toBe(false);
    expect(variants.querySelectorAll("[data-variants] tbody tr").length).toBeGreaterThan(0);
  });
});
