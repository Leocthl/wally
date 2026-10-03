// "Why trust Wally?" in plain words, the default view. One headline, a key to the three layers, then one card per idea;
// every number comes from the loaded run and wears a chip; a zero is paired with the limit it could hide; rules alone and
// Wally are compared first and an AI on its own is only for reference; "How we know" opens the developer view in place.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseHarnessFile } from "../src/evidence/harnessGuard";
import type { HarnessRun } from "../src/evidence/types";
import { EvidenceScreen } from "../src/screens/EvidenceScreen";
import { LocaleProvider, type Locale } from "../src/ui/locale";
import { bareFigures, numsWithoutChip } from "./helpers/figures";
import { loosePercents } from "./evidenceFigures";
import { harnessFile, wiringFile } from "./evidenceFixtures";

vi.setConfig({ testTimeout: 30_000 });

type Json = Record<string, unknown>;

const CHIP = "MEASURED(n=150, seed=7, commit=da2c814)";
const rate = (k: number, n: number, chip: string = CHIP): Json => ({ k, n, display: `${k}/${n}`, chip });
const latency = (p50: number, p95: number, chip: string = CHIP): Json => ({ measured: true, n: 146, p50_ms: p50, p95_ms: p95, chip, scope: "judge + engine + mint" });

/** A file shaped like the committed live run: Wally, rules only and an AI on its own, with the same counts. */
function realistic(over: Json = {}): Json {
  const base = harnessFile();
  return {
    ...base,
    label: CHIP,
    baselines: {
      B0: { scenarios: 150, overspend_rate: rate(9, 150), stop_breach_rate: rate(43, 84), injection_pass_through_rate: rate(4, 13), false_block_rate: rate(18, 66), latency: latency(206.1, 758.3) },
      B1: { scenarios: 150, overspend_rate: rate(0, 150), stop_breach_rate: rate(28, 84), injection_pass_through_rate: rate(13, 13), false_block_rate: rate(3, 66), latency: latency(1, 1.7) },
      B2: { scenarios: 150, overspend_rate: rate(0, 150), stop_breach_rate: rate(0, 84), injection_pass_through_rate: rate(0, 13), false_block_rate: rate(5, 66), latency: latency(159.7, 388.9) },
    },
    injection_corpus: { items: 40, false_allow_rate: rate(8, 40), tuning_split: rate(2, 20), heldout_split: rate(6, 20), benign_flagged_rate: rate(0, 8) },
    categories: [
      { category: "within_budget", B2: { scenarios: 18, legitimate: 18, completed: rate(15, 18), false_block: rate(3, 18) } },
      { category: "shipping_overflow", B2: { scenarios: 9, legitimate: 3, completed: rate(3, 3), false_block: rate(0, 3) } },
      { category: "injected_text", B2: { scenarios: 17, legitimate: 4, completed: rate(4, 4), false_block: rate(0, 4) } },
      { category: "wrong_merchant", B2: { scenarios: 8, legitimate: 4, completed: rate(4, 4), false_block: rate(0, 4) } },
    ],
    ...over,
  };
}

function run(raw: Json, file = "harness-7-live.json"): HarnessRun {
  const parsed = parseHarnessFile(file, raw);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  return parsed.value;
}

function show(r: HarnessRun | null, locale: Locale = "en", unreadable: { file: string; problems: string[] }[] = []): HTMLElement {
  return render(
    <LocaleProvider locale={locale}>
      <EvidenceScreen harness={{ items: r === null ? [] : [r], unreadable }} judge={{ items: [], unreadable: [] }} manual={null} captures={null} />
    </LocaleProvider>,
  ).container;
}

const card = (c: HTMLElement, id: string): HTMLElement => {
  const found = c.querySelector<HTMLElement>(`[data-plain-card="${id}"]`);
  if (found === null) throw new Error(`no card ${id}`);
  return found;
};
const text = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const ENGINEERS = /\b(B0|B1|B2|CI|p50|p95|T-H\d|F38|seed|commit|deterministic|pipeline|Wilson|interval|JSON|harness)\b|MEASURED\(/;

/** The words a person reads without opening anything: closed folds leave their bodies out. */
function wordsShown(c: HTMLElement): number {
  const clone = c.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("details:not([open]) > :not(summary)").forEach((n) => n.remove());
  clone.querySelectorAll(".sr-only").forEach((n) => n.remove());
  return text(clone).split(" ").filter(Boolean).length;
}

describe("the page opens on the headline and a short list", () => {
  it("folds the layers key and the five cards behind their titles, in the same order, closed to begin with", () => {
    const c = show(run(realistic()));
    const folds = [...c.querySelectorAll<HTMLDetailsElement>("details.evp-fold")];
    expect(folds.map((f) => f.dataset["fold"])).toEqual(["layers", "limit", "risky", "tricks", "honest", "speed"]);
    expect(folds.map((f) => text(f.querySelector("summary")))).toEqual(["What each layer adds", "Went over the limit", "Stopped before paying", "Trick listings", "Approved", "Speed"]);
    for (const f of folds) expect(f.open, f.dataset["fold"]).toBe(false);
  });

  it("keeps where Wally still gets it wrong open: the limits are not something to tap for", () => {
    const c = show(run(realistic()));
    const wrong = card(c, "wrong");
    expect(wrong.closest("details")).toBeNull();
    expect(text(wrong)).toContain("Wally blocked 5 of 66 honest purchases by mistake.");
  });

  it("reads a few hundred words before anything is opened (it was over six hundred), and every number is still in the page", () => {
    const c = show(run(realistic()));
    expect(wordsShown(c)).toBeLessThan(260);
    expect(text(card(c, "limit").querySelector(".evp-big"))).toBe("0 of 150 purchases");
    expect(text(card(c, "risky").querySelector(".evp-big"))).toBe("84 of 84 risky purchases");
  });

  it("says each title once when a fold is open: the card keeps its own for screen readers, and the summary shows it", () => {
    const c = show(run(realistic()));
    for (const fold of c.querySelectorAll("details.evp-fold")) {
      const inner = fold.querySelector(".evp-card__title, .evp-legend h3");
      expect(inner, fold.getAttribute("data-fold") ?? "").toHaveClass("sr-only");
    }
  });

  it("opens with a tap and keeps the chip of the card inside", async () => {
    const c = show(run(realistic()));
    const user = userEvent.setup();
    await user.click(c.querySelector('[data-fold="limit"] summary')!);
    expect(c.querySelector<HTMLDetailsElement>('[data-fold="limit"]')?.open).toBe(true);
    expect(card(c, "limit").querySelector("[data-chip]")).not.toBeNull();
  });

  it("reads in 繁", () => {
    const c = show(run(realistic()), "zh-HK");
    expect([...c.querySelectorAll("details.evp-fold summary")].map((n) => text(n)).slice(0, 2)).toEqual(["每一層加了甚麼", "超出上限"]);
  });
});

describe("plain is the default", () => {
  it("opens in plain words: the title, the headline and the cards in order", () => {
    const c = show(run(realistic()));
    expect(c.querySelector("[data-screen='evidence']")).toHaveAttribute("data-mode", "plain");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Why trust Wally?");
    const order = [...c.querySelectorAll("[data-plain-card]")].map((n) => n.getAttribute("data-plain-card"));
    expect(order).toEqual(["hero", "layers", "limit", "risky", "tricks", "honest", "speed", "wrong"]);
    expect(text(card(c, "hero").querySelector("h2"))).toBe("On our own test set, Wally stopped every risky purchase, and let about nine in ten honest ones through.");
  });

  it("says what each layer does before any card: rules hold the limit, the listing check adds protection against tricks", () => {
    const c = show(run(realistic()));
    expect(text(card(c, "hero"))).toContain("Rules and the card limit already keep spending under the limit. The listing check is what stops trick listings that rules alone let through.");
    const key = card(c, "layers");
    expect([...key.querySelectorAll("dt")].map(text)).toEqual(["Rules only", "Wally", "AI alone"]);
    // Rules only is the hard rules R1-R8 and R12 with the card limit: no seller check (R9), no listing check (R10).
    expect(text(key)).toContain("Your budget, what it can buy, the dates and the one-off card limit. No seller check, and nobody reads the listing.");
    expect(text(key)).toContain("The same, plus a seller check and a check that reads each listing.");
    expect(text(key)).toContain("For reference: an AI model decides");
  });

  it("never headlines an AI on its own: it is the last row of a card and absent from the headline", () => {
    const c = show(run(realistic()));
    expect(text(card(c, "hero").querySelector("h2"))).not.toMatch(/AI alone|AI on its own|model/i);
    for (const id of ["limit", "risky", "tricks", "honest"]) {
      const names = [...card(c, id).querySelectorAll(".evp-bar__name")].map(text);
      expect(names, id).toEqual(["Rules only", "Wally", "AI alone"]);
    }
  });

  it("describes the run it came from: how many shoppers, how many risky and honest, nothing real bought", () => {
    const c = show(run(realistic()));
    expect(text(card(c, "hero"))).toContain("Tested on 150 scripted purchases in a simulated shop: 84 risky and 66 honest. Nothing real was bought.");
  });
});

describe("the cards read the loaded counts", () => {
  let c: HTMLElement;
  beforeEach(() => {
    c = show(run(realistic()));
  });

  it("went over the limit: 0 of 150, rules alone already stop it, and the limit the zero could hide", () => {
    const limit = card(c, "limit");
    expect(text(limit.querySelector(".evp-big"))).toBe("0 of 150 purchases");
    expect(text(limit)).toContain("Rules alone already stop this. Rules only and Wally both had none, so the listing check adds nothing here.");
    expect(text(limit)).toContain("None went over on our own test set, but the true rate could still be up to about 2 in a hundred.");
    expect([...limit.querySelectorAll(".evp-bar")].map((r) => text(r))).toEqual(["Rules only 0 of 150", "Wally 0 of 150", "AI alone 9 of 150"]);
  });

  it("stopped before paying: 84 of 84, what rules alone did, the limit, and what counted as risky", () => {
    const risky = card(c, "risky");
    expect(text(risky.querySelector(".evp-big"))).toBe("84 of 84 risky purchases");
    expect(text(risky)).toContain("Wally stopped every one of them.");
    expect(text(risky)).toContain("Rules alone stopped about seven in ten of them.");
    expect(text(risky)).toContain("None got through on our own test set, but the true rate could still be up to about 4 in a hundred.");
    expect(text(risky)).toContain("They included going over the budget, listings that try to give Wally orders and the wrong shop.");
    expect([...risky.querySelectorAll(".evp-bar")].map((r) => text(r))).toEqual(["Rules only 56 of 84", "Wally 84 of 84", "AI alone 41 of 84"]);
  });

  it("trick listings: rules alone let every one through, Wally none, and how small that set is", () => {
    const tricks = card(c, "tricks");
    expect(text(tricks.querySelector(".evp-big"))).toBe("13 of 13 trick listings");
    expect(text(tricks)).toContain("Rules alone let every one of them through.");
    expect(text(tricks)).toContain("Wally let none through on our own test set. With so few listings, the true rate could still be up to about 23 in a hundred.");
    expect(text(tricks)).toContain("no fixed rule would stop, so only the listing check can");
    expect([...tricks.querySelectorAll(".evp-bar")].map((r) => text(r))).toEqual(["Rules only 0 of 13", "Wally 13 of 13", "AI alone 9 of 13"]);
  });

  it("approved: 61 of 66, and the 5 blocked by mistake are on this card, not only in the miss card", () => {
    const honest = card(c, "honest");
    expect(text(honest.querySelector(".evp-big"))).toBe("61 of 66 honest purchases");
    expect(text(honest)).toContain("Wally let about nine in ten honest purchases through and blocked 5 by mistake.");
    expect(text(honest)).toContain("Rules only blocked 3 by mistake. The listing check adds some false alarms.");
    expect([...honest.querySelectorAll(".evp-bar")].map((r) => text(r))).toEqual(["Rules only 63 of 66", "Wally 61 of 66", "AI alone 48 of 66"]);
  });

  it("speed: the typical time, nearly every decision, and where the time goes", () => {
    const speed = card(c, "speed");
    expect(text(speed.querySelector(".evp-big"))).toBe("0.16 seconds for a typical decision");
    expect(text(speed)).toContain("Nearly every decision took under 0.39 seconds.");
    expect(text(speed)).toContain("Rules alone are faster: reading the listing is what takes the time.");
    expect([...speed.querySelectorAll(".evp-bar")].map((r) => text(r))).toEqual(["Rules only under 0.01", "Wally 0.16", "AI alone 0.21"]);
  });

  it("where Wally still gets it wrong: the false alarms and the listing check on its own", () => {
    const wrong = card(c, "wrong");
    expect([...wrong.querySelectorAll("li")].map(text)).toEqual([
      "Wally blocked 5 of 66 honest purchases by mistake.",
      "On its own, Wally's listing check missed 8 of 40 made-up trick listings. It is only one layer: the budget limit and the card limit do not depend on it.",
    ]);
    expect(text(c.querySelector(".evp-foot"))).toBe("All of this comes from our own scripted test purchases in a simulated shop, with simulated cards and no real money. Real shops can behave differently.");
  });

  it("draws every bar as a share of its own whole", () => {
    const widths = (id: string): (string | null)[] => [...card(c, id).querySelectorAll<HTMLElement>(".evp-bar__fill")].map((f) => f.getAttribute("data-share"));
    expect(widths("limit")).toEqual(["0.0", "0.0", "6.0"]);
    expect(widths("risky")).toEqual(["66.7", "100.0", "48.8"]);
    expect(widths("tricks")).toEqual(["0.0", "100.0", "69.2"]);
  });
});

describe("honesty", () => {
  it("no number without a chip, no bare figure, no percentage, none of the engineers' words, no test count", () => {
    const c = show(run(realistic()));
    expect(bareFigures(c)).toEqual([]);
    expect(numsWithoutChip(c)).toEqual([]);
    expect(loosePercents(c)).toEqual([]);
    expect(c.textContent ?? "").not.toMatch(ENGINEERS);
    expect(c.textContent ?? "").not.toMatch(/\d+\s+(tests?|files?)|test files|tests pass/i);
  });

  it("every card says where its numbers come from, in plain words, and what that means when tapped", async () => {
    const c = show(run(realistic()));
    const chips = c.querySelectorAll("[data-chip]");
    expect(chips.length).toBeGreaterThanOrEqual(7);
    for (const chip of chips) expect(chip).toHaveTextContent("Measured on 150 scripted test purchases, in a simulated shop");
    const limit = card(c, "limit");
    const button = within(limit).getByRole("button", { name: /Measured on 150/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    const panel = limit.querySelector(".evp-chipdetail") as HTMLElement;
    expect(panel).toHaveAttribute("hidden");
    await userEvent.setup().click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("hidden");
    expect(panel).toHaveTextContent("we counted the results ourselves");
    expect(panel).toHaveTextContent("No real shop, card or money");
  });

  it("a recorded run says replayed, and has no speed number", () => {
    const rec = "RECORDED(n=150, seed=7, commit=da2c814)";
    const raw = realistic({ mode: "recorded", label: rec });
    const b = raw["baselines"] as Record<string, Json>;
    const swap = (o: Json): Json => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "object" && v !== null && "chip" in v ? { ...(v as Json), chip: rec } : v]));
    const notMeasured = { measured: false, note: "not measured: replayed", chip: rec };
    const c = show(run({ ...raw, baselines: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, { ...swap(v), latency: notMeasured }])) }, "harness-7-recorded.json"));
    expect(text(card(c, "limit"))).toContain("Replayed from a recording of 150 scripted test purchases, in a simulated shop");
    expect(text(card(c, "speed"))).toContain("Speed was not measured in this run, so there is no number.");
    expect(card(c, "speed").querySelector("[data-num]")).toBeNull();
    expect(bareFigures(c)).toEqual([]);
    expect(numsWithoutChip(c)).toEqual([]);
  });

  it("a wiring-only run says so before anything and stamps every card", () => {
    const c = show(run(wiringFile()));
    const banner = c.querySelector("[data-wiring-banner]");
    expect(banner).toHaveTextContent("A wiring check, not a result yet");
    const cards = [...c.querySelectorAll("[data-plain-card]")].filter((n) => n.getAttribute("data-plain-card") !== "layers");
    expect(cards.length).toBeGreaterThan(0);
    for (const n of cards) expect(n.querySelector("[data-wiring-stamp]"), n.getAttribute("data-plain-card") ?? "").not.toBeNull();
    expect((banner as Element).compareDocumentPosition(cards[0] as Element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("states a worse result as plainly as a better one", () => {
    const raw = realistic();
    const b = raw["baselines"] as Record<string, Json>;
    const worse = { ...raw, baselines: { ...b, B2: { ...b["B2"], overspend_rate: rate(3, 150), stop_breach_rate: rate(20, 84), false_block_rate: rate(30, 66) } } };
    const c = show(run(worse));
    expect(text(card(c, "hero").querySelector("h2"))).toBe("On our own test set, Wally stopped about eight in ten of the risky purchases, and let about five in ten honest ones through.");
    expect(text(card(c, "limit"))).toContain("Rules only had none go over the limit; Wally had 3.");
    expect(text(card(c, "limit"))).not.toContain("Rules alone already stop this");
    expect(card(c, "hero")).not.toHaveTextContent("Rules and the card limit already keep spending under the limit.");
    expect(numsWithoutChip(c)).toEqual([]);
    expect(bareFigures(c)).toEqual([]);
  });
});

describe("what the file does not carry is left out, never guessed", () => {
  it("without rules only: no rules row, no rules sentence, no layer line", () => {
    const raw = realistic();
    const b = raw["baselines"] as Record<string, Json>;
    const c = show(run({ ...raw, baselines: { B0: b["B0"], B2: b["B2"] } }));
    expect([...card(c, "limit").querySelectorAll(".evp-bar__name")].map(text)).toEqual(["Wally", "AI alone"]);
    expect(text(card(c, "limit"))).not.toContain("Rules");
    expect(card(c, "hero")).not.toHaveTextContent("Rules and the card limit already keep");
    expect([...card(c, "layers").querySelectorAll("dt")].map(text)).toEqual(["Wally", "AI alone"]);
  });

  it("without the trick-listing counts: no trick card", () => {
    const raw = realistic();
    const b = raw["baselines"] as Record<string, Json>;
    const strip = (o: Json): Json => Object.fromEntries(Object.entries(o).filter(([k]) => k !== "injection_pass_through_rate"));
    const c = show(run({ ...raw, baselines: { B0: strip(b["B0"] as Json), B1: strip(b["B1"] as Json), B2: strip(b["B2"] as Json) } }));
    expect(c.querySelector('[data-plain-card="tricks"]')).toBeNull();
    expect(card(c, "hero")).not.toHaveTextContent("The listing check is what stops trick listings");
  });

  it("with no readable result at all: one honest line and the way in to the details", () => {
    const c = show(null, "en", [{ file: "harness-9-live.json", problems: ["the baselines block is missing"] }]);
    expect(c).toHaveTextContent("No test results could be read, so no numbers are shown.");
    expect(c).toHaveTextContent("A result file could not be read and was left out.");
    expect(c.querySelector("[data-plain-card]")).toBeNull();
    expect(screen.getByText("How we know")).toBeInTheDocument();
  });
});

describe("How we know: the developer view, in place", () => {
  it("is closed and not even mounted until opened, then holds the exact counts, intervals and files", async () => {
    const c = show(run(realistic()));
    const how = c.querySelector<HTMLDetailsElement>('details[data-panel="how-we-know"]') as HTMLDetailsElement;
    expect(how.open).toBe(false);
    expect(c.querySelector(".ev-harness")).toBeNull();
    await userEvent.setup().click(within(how).getByText("How we know"));
    await waitFor(() => expect(how.querySelector(".ev-harness")).not.toBeNull());
    expect(how.open).toBe(true);
    expect(how).toHaveTextContent("For engineers: every count, interval and limit behind the cards above.");
    expect(how.textContent ?? "").toMatch(/B2/);
    expect(how.textContent ?? "").toMatch(/CI /);
    expect(how.querySelector(".ev-picker")).not.toBeNull();
  });
});

describe("in 繁", () => {
  it("speaks 繁 with every Chinese run marked zh-HK, and the same honesty", () => {
    const c = show(run(realistic()), "zh-HK");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("為甚麼可以信任 Wally？");
    expect(text(card(c, "hero").querySelector("h2"))).toBe("在我們自己的測試中，Wally 攔截了每一宗高風險購買，並讓約九成正常購買順利完成。");
    expect(text(card(c, "limit"))).toContain("在我們自己的測試中沒有任何一宗超出上限，但真實比率仍可能高達約每一百宗有 2 宗。");
    expect(card(c, "limit").querySelector("[data-chip]")).toHaveTextContent("在模擬商店中，以 150 宗腳本測試購買量度");
    const cjk = /[㐀-鿿]/;
    const bad: string[] = [];
    const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (cjk.test(node.textContent ?? "") && node.parentElement?.closest("[lang]")?.getAttribute("lang") !== "zh-HK") bad.push((node.textContent ?? "").slice(0, 20));
    }
    expect(bad).toEqual([]);
    expect(bareFigures(c)).toEqual([]);
    expect(numsWithoutChip(c)).toEqual([]);
  });
});
