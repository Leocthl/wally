// Presenter keyboard shortcuts and language: Space or Right arrow steps, R resets, a focused button keeps its own Space
// (no double step), and EN | 繁 | Both changes only the presenter (both languages side by side, each run marked).
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { bootApp } from "./helpers/app";
import { bareFigures, numsWithoutChip } from "./helpers/figures";

vi.setConfig({ testTimeout: 30_000 });

const moment = (): string => document.querySelector(".pr-bar__moment")?.textContent ?? "";
/** The bar's accessible name follows the presenter language, so find it by its class here. */
const bar = (): HTMLElement => document.querySelector<HTMLElement>("nav.pr-bar")!;

describe("presenter shortcuts", () => {
  it("steps with Space and the Right arrow, and resets with R", async () => {
    const h = await bootApp("#/presenter");
    expect(moment()).toBe("DM1");
    (document.activeElement as HTMLElement | null)?.blur();
    await h.user.keyboard(" ");
    await waitFor(() => expect(screen.getByRole("region", { name: "Budget sealed" })).toBeInTheDocument());
    expect(moment()).toBe("DM2");
    await h.user.keyboard("{ArrowRight}");
    await waitFor(() => expect(document.querySelector('[data-card-state="ACTIVE"]')).not.toBeNull());
    expect(moment()).toBe("DM2");
    expect(within(bar()).getByText("The shop asks for more")).toBeInTheDocument();
    await h.user.keyboard("r");
    await waitFor(() => expect(moment()).toBe("DM1"));
    await waitFor(() => expect(screen.getByRole("meter", { name: "Budget left" })).toHaveAttribute("aria-valuetext", expect.stringContaining("HK$800 left")));
    expect(document.querySelector("[data-card-state]")).toBeNull();
  });

  it("lets a focused button keep its own Space: one press, one step", async () => {
    const h = await bootApp("#/presenter");
    screen.getByRole("button", { name: /^Step/ }).focus();
    await h.user.keyboard(" ");
    await waitFor(() => expect(moment()).toBe("DM2"));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Step/ })).toBeEnabled());
    expect(moment()).toBe("DM2");
  });
});

describe("presenter language", () => {
  it("shows 繁 on the presenter only, and both languages side by side with Both", async () => {
    const h = await bootApp("#/presenter");
    await h.user.click(within(bar()).getByRole("radio", { name: "繁體中文" }));
    expect(within(bar()).getByText("鎖定預算，簽署規則")).toBeInTheDocument();
    expect(within(bar()).getByRole("button", { name: /^下一步/ })).toBeInTheDocument();
    await h.user.click(within(bar()).getByRole("radio", { name: /Both|雙語/ }));
    const title = bar().querySelector(".pr-bar__title")!;
    expect(title.querySelector('[lang="en"]')).toHaveTextContent("Seal the budget, sign the rules");
    expect(title.querySelector('[lang="zh-HK"]')).toHaveTextContent("鎖定預算，簽署規則");
    await h.user.click(within(bar()).getByRole("button", { name: /^Step/ }));
    await waitFor(() => expect(document.querySelector('[data-view="seal"] .tx-both [lang="zh-HK"]')).not.toBeNull());
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
  });

  it("keeps REAL off with its reason until a capture exists", async () => {
    await bootApp("#/presenter");
    expect(within(bar()).getByRole("radio", { name: /REAL/ })).toBeDisabled();
    expect(within(bar()).getByText(/no capture yet/)).toBeInTheDocument();
    expect(within(bar()).getByRole("radio", { name: /SIMULATED/ })).toBeChecked();
  });
});
