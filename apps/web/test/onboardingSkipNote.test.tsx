// Skip on the first run seals the booth's ready-made budget when there is none. The note under the Skip link says so before the
// tap ("Skip uses a ready-made HK$800 budget for clothes."), on every step, with the amount wearing its SIMULATED chip; and
// what it says is what Skip does. A booth that already holds a budget seals nothing, so it has no note.
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { chipsToRules, compileMandate, M0_SENTENCE } from "../src/booth/compile";
import { readyMadeBudgetMinor } from "../src/screens/onboarding/ensureBudget";
import { bareFigures, numsWithoutChip } from "./helpers/figures";
import { buyStep, hello, openFirstRun, skip, tourCard } from "./helpers/firstRun";

vi.setConfig({ testTimeout: 30_000 });

const note = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-skip-note]");
const noteText = (): string | null => note()?.textContent?.replace(/\s+/g, " ").trim() ?? null;
const next = () => screen.getByRole("button", { name: /^Next/ });

describe("the ready-made budget the note talks about", () => {
  it("is HK$800 for clothes, read from the booth's own sentence", () => {
    expect(readyMadeBudgetMinor()).toBe(80_000);
    expect([...chipsToRules(compileMandate(M0_SENTENCE, new Date()).chips).categories]).toEqual(["apparel"]);
  });
});

describe("the note under Skip", () => {
  it("is there on Hello, with the amount and its SIMULATED chip, and Skip points at it", async () => {
    await openFirstRun();
    await hello();
    expect(noteText()).toMatch(/^Skip uses a ready-made HK\$800 budget for clothes\.\s?SIMULATED$/);
    expect(note()?.querySelector('[data-num][data-prov="SIMULATED"]')).not.toBeNull();
    expect(note()?.querySelector('[data-chip][data-prov="SIMULATED"]')).not.toBeNull();
    // The button's name stays "Skip"; the note is its description, read after it.
    const button = screen.getByRole("button", { name: "Skip" });
    expect(button).toHaveAccessibleDescription(/ready-made HK\$800 budget for clothes/);
  });

  it("follows Skip to What can Wally buy for you? and to Your first budget, and goes once a budget is locked in", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.click(next());
    await buyStep();
    expect(noteText()).toMatch(/ready-made HK\$800 budget for clothes/);
    await user.click(next());
    await screen.findByRole("heading", { level: 1, name: "Your first budget" });
    expect(noteText()).toMatch(/ready-made HK\$800 budget for clothes/);
    await user.click(await screen.findByRole("button", { name: "Review budget" }));
    await user.click(await screen.findByRole("button", { name: /Lock in budget/ }));
    await screen.findByRole("heading", { level: 1, name: "Your budget is locked in" });
    expect(note()).toBeNull();
  });

  it("is true: Skip seals that budget, HK$800 for clothes", async () => {
    const { api, user } = await openFirstRun();
    await hello();
    await user.click(skip());
    await tourCard();
    const snap = await api.snapshot();
    expect(snap.packet?.budget_minor).toBe(80_000);
    expect(snap.mandate?.rules.categories).toEqual(["apparel"]);
  });

  it("is not there when the booth already holds a budget: Skip seals nothing", async () => {
    const { user } = await openFirstRun({ sealed: true });
    await hello();
    expect(note()).toBeNull();
    expect(screen.getByRole("button", { name: "Skip" })).not.toHaveAttribute("aria-describedby");
    await user.click(next());
    await buyStep();
    expect(note()).toBeNull();
  });

  it("has no bare figure and no amount without its chip", async () => {
    await openFirstRun();
    await hello();
    const element = note();
    expect(element).not.toBeNull();
    if (element === null) return;
    expect(bareFigures(element)).toEqual([]);
    expect(numsWithoutChip(element)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
  });

  it("is in 繁體 too, marked zh-HK, with the amount in HK$", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.click(screen.getByRole("radio", { name: "繁體中文" }));
    await screen.findByRole("heading", { level: 1, name: "你好，我係 Wally。" });
    expect(noteText()).toMatch(/^略過會用現成嘅 HK\$800 預算買衫。\s?SIMULATED$/);
    expect(note()?.closest("[lang]")).toHaveAttribute("lang", "zh-HK");
  });
});
