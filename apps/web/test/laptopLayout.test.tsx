// The laptop layout (64rem and up): top navigation with Ask Wally beside it instead of the tab bar, the Budget screen in
// columns with Manage under the budget card, the scenarios as an open panel of tabs, and sheets as drawers. Below that width
// nothing changes. jsdom has no layout, so the width is a matchMedia stub; the CSS itself is read by the e2e laptop spec.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootApp, screenReady } from "./helpers/app";

vi.setConfig({ testTimeout: 30_000 });

/** A window this many CSS pixels wide: every `(min-width: Nrem)` query is answered from it (16 px to the rem). */
function stubWidth(px: number): void {
  vi.stubGlobal("matchMedia", (query: string) => {
    const min = /min-width:\s*([\d.]+)rem/.exec(query);
    return {
      matches: min === null ? false : px >= Number(min[1]) * 16,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
  });
}

const part = (selector: string): Element => document.querySelector(selector)!;
const tab = (name: string) => screen.getByRole("tab", { name });
const scenario = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-scenario="${id}"]`);

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("on a laptop", () => {
  beforeEach(() => stubWidth(1440));

  it("shows the four places as words in the top bar, with Ask Wally beside them, and no tab bar", async () => {
    await bootApp("#/budget");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Budget", "Wally", "Receipts", "Proof"]);
    expect(within(nav).getByRole("link", { name: "Budget" })).toHaveAttribute("aria-current", "page");
    expect(within(part("header.shell-bar") as HTMLElement).getByRole("button", { name: "Ask Wally" })).toBeInTheDocument();
    expect(document.querySelector(".w-tabbar")).toBeNull();
    expect(part(".shell-app")).toHaveAttribute("data-layout", "desktop");
  });

  it("opens the Ask sheet from the top bar, as a drawer: nothing to drag down", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(within(part("header.shell-bar") as HTMLElement).getByRole("button", { name: "Ask Wally" }));
    const sheet = await screen.findByRole("dialog", { name: "What should Wally try?" });
    expect(sheet.querySelector(".w-sheet__top")).not.toHaveAttribute("title");
  });

  it("puts Manage this budget under the budget card, and the scenarios in their own column", async () => {
    await bootApp("#/budget");
    const now = part(".home-col--now");
    expect(now.contains(part(".home-hero__card"))).toBe(true);
    expect(now.contains(part("#budget-console"))).toBe(true);
    expect(part(".home-col--test").contains(part("[data-demo-disclosure]"))).toBe(true);
    expect(part(".home-col--test").contains(part("#budget-console"))).toBe(false);
  });

  it("keeps the scenarios open as a panel of tabs, Buy first, with nothing to expand", async () => {
    await bootApp("#/budget");
    const demo = part("[data-demo-disclosure]");
    expect(demo.tagName).toBe("SECTION");
    expect(demo).toHaveAttribute("data-static");
    expect(within(demo as HTMLElement).getByRole("heading", { name: /Demo scenarios/ })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Buy", "Stops", "Card", "Budget"]);
    expect(tab("Buy")).toHaveAttribute("aria-selected", "true");
    expect(scenario("normal")).not.toBeNull();
    expect(scenario("flagged")).toBeNull();
  });

  it("has no disclosure button to press: the heading is a heading, and the panel cannot be closed", async () => {
    await bootApp("#/budget");
    const demo = part("[data-demo-disclosure]") as HTMLElement;
    expect(demo.querySelector("summary")).toBeNull();
    expect(demo.querySelector("details")).toBeNull();
    expect(within(demo).queryByRole("button", { name: /Demo scenarios/ })).toBeNull();
  });

  it("shows one group at a time: Stops has its five cards, and a card runs its scenario", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(tab("Stops"));
    expect(tab("Stops")).toHaveAttribute("aria-selected", "true");
    expect(["flagged", "overflow", "injected", "off_category", "unverified"].map((id) => scenario(id) !== null)).toEqual([true, true, true, true, true]);
    expect(scenario("normal")).toBeNull();
    await h.user.click(scenario("flagged")!);
    await screenReady();
    await waitFor(() => expect(window.location.hash).toBe("#/wally"));
  });

  it("moves between the tabs with the arrow keys, Home and End", async () => {
    await bootApp("#/budget");
    tab("Buy").focus();
    fireEvent.keyDown(tab("Buy"), { key: "ArrowRight" });
    await waitFor(() => expect(tab("Stops")).toHaveAttribute("aria-selected", "true"));
    expect(tab("Stops")).toHaveFocus();
    fireEvent.keyDown(tab("Stops"), { key: "End" });
    await waitFor(() => expect(tab("Budget")).toHaveAttribute("aria-selected", "true"));
    fireEvent.keyDown(tab("Budget"), { key: "ArrowRight" });
    await waitFor(() => expect(tab("Buy")).toHaveAttribute("aria-selected", "true"));
    fireEvent.keyDown(tab("Buy"), { key: "Home" });
    expect(tab("Buy")).toHaveAttribute("aria-selected", "true");
  });

  it("gives each tab one tab stop: only the chosen one is reachable with Tab", async () => {
    await bootApp("#/budget");
    expect(screen.getAllByRole("tab").map((t) => t.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  it("keeps Top up and Change the rules reachable as links", async () => {
    await bootApp("#/budget");
    const manage = part("#budget-console") as HTMLElement;
    expect(within(manage).getByRole("link", { name: /Top up/ })).toHaveAttribute("href", expect.stringContaining("#/seal"));
    expect(within(manage).getByRole("link", { name: /Change the rules/ })).toHaveAttribute("href", expect.stringContaining("#/seal"));
  });
});

describe("below 64rem", () => {
  beforeEach(() => stubWidth(900));

  it("is the phone layout: the tab bar with its raised Ask button, no top navigation, the scenarios as a disclosure of cards", async () => {
    await bootApp("#/budget");
    expect(part(".shell-app")).toHaveAttribute("data-layout", "phone");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("button", { name: "Ask" })).toBeInTheDocument();
    expect(document.querySelector(".shell-topnav")).toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(part("#budget-console").closest(".home-col--test")).not.toBeNull();
    expect(part(".home-demo")).not.toHaveAttribute("data-static");
  });
});
