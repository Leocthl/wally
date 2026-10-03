// The presenter's big screen in plain words, which is the default: the three live stops (DM3 to DM5) give the reason the
// Wally screen gives, not the engine's "Stopped by R3" sentence, with every figure still chipped and no word only
// engineers use on the stage. Developer mode keeps the engine's sentence (presenterScreen.test.tsx).
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { bootApp } from "./helpers/app";
import { developerMode } from "./helpers/devMode";
import { bareFigures, numsWithoutChip } from "./helpers/figures";
import { ENGINEERS, visibleText } from "./helpers/plainWords";

vi.setConfig({ testTimeout: 30_000 });

const step = () => screen.getByRole("button", { name: /^Step/ });
async function stepTo(h: Awaited<ReturnType<typeof bootApp>>, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await waitFor(() => expect(step()).toBeEnabled());
    await h.user.click(step());
  }
}

const stop = (template: string): Element | null => document.querySelector(`[role="alert"][data-template="${template}"]`);

describe("the presenter's stops in plain words", () => {
  it("DM3 to DM5 give each stop's plain reason, with the figures chipped and no rule id on the stage", async () => {
    const h = await bootApp("#/presenter");
    await stepTo(h, 5);
    await waitFor(() => expect(stop("R9.flagged")).toHaveTextContent("Stopped before paying"));
    expect(stop("R9.flagged")).toHaveTextContent("This seller is flagged as a possible scam.");
    expect(stop("R9.flagged")).toHaveTextContent("No card was made.");
    expect(visibleText(document.body)).not.toMatch(ENGINEERS);

    await stepTo(h, 1);
    await waitFor(() => expect(stop("R3.over_remaining")).toHaveTextContent("It costs HK$550 with shipping, but only HK$541 is left in your budget."));
    expect(stop("R3.over_remaining")?.querySelectorAll("[data-num]").length).toBe(2);
    expect(visibleText(document.body)).not.toMatch(ENGINEERS);
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);

    await stepTo(h, 1);
    await waitFor(() => expect(stop("R10.injection")).toHaveTextContent("The listing tried to give Wally orders."));
    expect(stop("R10.injection")).not.toHaveTextContent(/Injection risk|\d\.\d\d/);
    expect(visibleText(document.body)).not.toMatch(ENGINEERS);
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
  });

  it("the same stops in developer mode keep the engine's own sentence", async () => {
    developerMode();
    const h = await bootApp("#/presenter");
    await stepTo(h, 6);
    await waitFor(() => expect(stop("R3.over_remaining")).toHaveTextContent("Stopped by R3. Total HK$550 is over the HK$541 left."));
  });
});
