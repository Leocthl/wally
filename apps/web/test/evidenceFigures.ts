// Extra honesty scans for the Evidence screen, on top of the shared "no number without a chip" helpers.
import { bareFigures, numsWithoutChip } from "./helpers/figures";

/** A measured or replayed percentage must sit in the same figure as its k/n. ASSUMED targets are thresholds, not rates. */
export function percentWithoutKn(root: Element): string[] {
  return [...root.querySelectorAll("[data-num]")]
    .filter((el) => ["MEASURED", "RECORDED"].includes(el.getAttribute("data-prov") ?? ""))
    .map((el) => el.querySelector(".num__v")?.textContent ?? "")
    .filter((text) => text.includes("%") && !/\d+\/\d+/.test(text));
}

/** Text percentages anywhere outside a figure: none allowed. */
export function loosePercents(root: Element): string[] {
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll("[data-num],[data-chip]").forEach((n) => n.remove());
  return [...(clone.textContent ?? "").matchAll(/\d+(?:\.\d+)?\s?%/g)].map((m) => m[0]);
}

/** Every chart's text alternative names the chip of every figure drawn inside it. */
export function chartLabelsMissingChips(root: Element): string[] {
  return [...root.querySelectorAll('[role="img"]')].flatMap((img) => {
    const aria = img.getAttribute("aria-label") ?? "";
    const scope = img.closest("[data-chip-scope]");
    const chips = [...(scope?.querySelectorAll(":scope > .chip-scope__chips .chip__text") ?? [])].map((c) => c.textContent ?? "");
    return chips.filter((c) => !aria.includes(c)).map((c) => `${aria.slice(0, 40)}: ${c}`);
  });
}

export function honestyProblems(root: Element): Record<string, string[]> {
  return {
    bare: bareFigures(root),
    unchipped: numsWithoutChip(root),
    percentWithoutKn: percentWithoutKn(root),
    loosePercents: loosePercents(root),
    chartLabels: chartLabelsMissingChips(root),
  };
}

export const CLEAN = { bare: [], unchipped: [], percentWithoutKn: [], loosePercents: [], chartLabels: [] };
