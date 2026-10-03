// The laptop layout (64rem and up): top navigation with Ask Wally beside it instead of the tab bar, the Budget screen in
// columns with Manage under the budget card, the scenarios as an open panel of tabs, and sheets as drawers. Below that width
// nothing changes. jsdom has no layout, so the width is a matchMedia stub; the CSS itself is read by the e2e laptop spec.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revealConsole } from "../src/shell/actions";
import { bootApp, go, screenReady } from "./helpers/app";

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

  it("brings the chosen scenario tab back after a visit to another page, so the next stop is one click", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(tab("Stops"));
    await h.user.click(scenario("flagged")!);
    await screenReady();
    await go("#/budget");
    expect(tab("Stops")).toHaveAttribute("aria-selected", "true");
    expect(scenario("flagged")).not.toBeNull();
  });

  it("starts on Buy in a new session, and ignores a remembered tab that no longer exists", async () => {
    window.sessionStorage.setItem("wally:demo-tab", "family");
    await bootApp("#/budget");
    expect(tab("Buy")).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the scenarios inside the Ask drawer a disclosure: the panel is the Budget screen's", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(within(part("header.shell-bar") as HTMLElement).getByRole("button", { name: "Ask Wally" }));
    const sheet = await screen.findByRole("dialog", { name: "What should Wally try?" });
    const inSheet = sheet.querySelector("[data-demo-disclosure]");
    expect(inSheet?.tagName).toBe("DETAILS");
    expect(inSheet).not.toHaveAttribute("data-static");
  });

  it("gives the Ask Wally button its own class, apart from the Ask sheet's body", async () => {
    await bootApp("#/budget");
    expect(within(part("header.shell-bar") as HTMLElement).getByRole("button", { name: "Ask Wally" })).toHaveClass("shell-bar__ask");
    expect(document.querySelector(".shell-ask")).toBeNull();
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

describe("revealing Manage this budget", () => {
  const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

  function setup(consoleRect: DOMRect): { scroll: ReturnType<typeof vi.fn>; el: HTMLElement } {
    document.body.innerHTML = '<header class="shell-bar"></header><section id="budget-console" tabindex="-1"></section>';
    const el = document.getElementById("budget-console")!;
    const scroll = vi.fn();
    el.scrollIntoView = scroll as unknown as typeof el.scrollIntoView;
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(consoleRect);
    vi.spyOn(document.querySelector(".shell-bar")!, "getBoundingClientRect").mockReturnValue(rect(0, 72));
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    return { scroll, el };
  }

  it("only focuses it when it is already on screen below the bar (the laptop)", () => {
    const { scroll, el } = setup(rect(600, 760));
    revealConsole();
    expect(scroll).not.toHaveBeenCalled();
    expect(el).toHaveFocus();
  });

  it("scrolls to it when it is below the fold (a phone)", () => {
    const { scroll, el } = setup(rect(2800, 3070));
    revealConsole();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(el).toHaveFocus();
  });

  it("scrolls to it when the bar covers its top", () => {
    const { scroll } = setup(rect(40, 300));
    revealConsole();
    expect(scroll).toHaveBeenCalledTimes(1);
  });
});
