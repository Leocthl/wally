// The app shell (lane b-shell): the route table and legacy redirects, the tab bar, the Ask and About sheets, language
// and theme, first-run gating, a failed first load with Retry, and a screen that throws without blanking the page.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { parseHash, routeHref } from "../src/hooks/useRoute";
import { ErrorBoundary } from "../src/shell/ErrorBoundary";
import { THEME_KEY } from "../src/shell/theme";
import { bootApp, go, screenReady } from "./helpers/app";
import { FirstLoadFails, FirstSealFails } from "./helpers/shellClients";

vi.setConfig({ testTimeout: 20_000 });

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.clear();
});

describe("route table", () => {
  it.each([
    ["", "budget"],
    ["#/", "budget"],
    ["#/booth", "budget"],
    ["#/budget", "budget"],
    ["#/wally", "wally"],
    ["#/receipts", "receipts"],
    ["#/proof", "proof"],
    ["#/seal", "seal"],
    ["#/evidence", "evidence"],
    ["#/presenter", "presenter"],
    ["#/nothing-here", "budget"],
    ["#main", "budget"],
  ])("%j shows %s, with no redirect", (hash, name) => {
    expect(parseHash(hash)).toEqual({ route: { name, params: {} }, redirect: null });
  });

  it.each([
    ["#/run", "wally", {}, "#/wally"],
    ["#/console", "budget", { focus: "console" }, "#/budget?focus=console"],
    ["#/log", "receipts", {}, "#/receipts"],
  ])("legacy %s goes to %s and replaces the address", (hash, name, params, redirect) => {
    expect(parseHash(hash)).toEqual({ route: { name, params }, redirect });
  });

  it("carries query params both ways", () => {
    const href = routeHref("wally", { decision: "dec_mock0007" });
    expect(href).toBe("#/wally?decision=dec_mock0007");
    expect(parseHash(href).route).toEqual({ name: "wally", params: { decision: "dec_mock0007" } });
  });

  it("replaces a legacy address in the app without adding history", async () => {
    window.location.hash = "#/run";
    const before = window.history.length;
    await bootApp("#/run");
    await waitFor(() => expect(window.location.hash).toBe("#/wally"));
    expect(window.history.length).toBe(before);
    expect(screen.getByRole("link", { name: "Wally" })).toHaveAttribute("aria-current", "page");
  });
});

describe("tab bar", () => {
  it.each([
    ["#/budget", "Budget"],
    ["#/booth", "Budget"],
    ["#/wally", "Wally"],
    ["#/receipts", "Receipts"],
    ["#/proof", "Proof"],
    ["#/evidence", "Proof"],
  ])("on %s the %s tab is current", async (hash, tab) => {
    await bootApp(hash);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page")).toHaveLength(1);
  });

  it("is hidden in the Seal flow and on the presenter stage", async () => {
    await bootApp("#/seal");
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    await go("#/presenter");
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(document.querySelector(".shell-app--wide")).not.toBeNull();
  });

  it("opens the Ask sheet from every tab screen", async () => {
    const h = await bootApp("#/budget");
    for (const hash of ["#/budget", "#/wally", "#/receipts", "#/proof"]) {
      await go(hash);
      await h.user.click(screen.getByRole("button", { name: /^Ask$/ }));
      const sheet = await screen.findByRole("dialog", { name: /What should Wally try/ });
      expect(within(sheet).getAllByRole("button").filter((b) => b.hasAttribute("data-scenario"))).toHaveLength(13);
      await h.user.click(within(sheet).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: /What should Wally try/ })).toBeNull());
    }
  });
});

describe("About sheet", () => {
  async function openAbout(): Promise<{ readonly user: ReturnType<typeof userEvent.setup>; readonly sheet: HTMLElement }> {
    const h = await bootApp("#/budget");
    await h.user.click(screen.getByRole("button", { name: /About and settings/ }));
    return { user: h.user, sheet: await screen.findByRole("dialog", { name: "About Wally" }) };
  }

  it("says how the demo runs, from api.info()", async () => {
    const { sheet } = await openAbout();
    expect(within(sheet).getByText("Offline demo in this browser")).toBeInTheDocument();
    expect(within(sheet).getByText("Replayed")).toBeInTheDocument();
    expect(within(sheet).getByText(/Recorded proposals \(SIMULATED\)/)).toBeInTheDocument();
    expect(within(sheet).getByText(/Recorded answers \(SIMULATED\)/)).toBeInTheDocument();
  });

  it("switches the theme on <html> and remembers it; Auto clears it", async () => {
    const { user, sheet } = await openAbout();
    await user.click(within(sheet).getByRole("radio", { name: "Dark" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    await user.click(within(sheet).getByRole("radio", { name: "Auto" }));
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it("switches the language for the whole app, sheets and <html lang> included", async () => {
    const { user, sheet } = await openAbout();
    await user.click(within(sheet).getAllByRole("radio", { name: "繁體中文" })[0]!);
    expect(await screen.findByRole("dialog", { name: "關於 Wally" })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "zh-HK");
    expect(screen.getAllByText("預算剩餘").length).toBeGreaterThan(0);
    expect(window.localStorage.getItem("wally:lang")).toBe("zh-HK");
  });

  it("links to Why trust Wally, the presenter and the style guide, and closes when one is followed", async () => {
    const { user, sheet } = await openAbout();
    expect(within(sheet).getByRole("link", { name: "Presenter mode" })).toHaveAttribute("href", "#/presenter");
    expect(within(sheet).getByRole("link", { name: "Style guide" })).toHaveAttribute("href", "#/styleguide");
    await user.click(within(sheet).getByRole("link", { name: "Why trust Wally?" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "About Wally" })).toBeNull());
    expect(window.location.hash).toBe("#/evidence");
  });
});

describe("first run and failures", () => {
  it("sends the visitor to Seal when no budget could be sealed on load", async () => {
    window.location.hash = "#/budget";
    render(<App api={new FirstSealFails()} /> as ReactElement);
    expect(await screen.findByRole("heading", { name: "Meet Wally" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/seal");
    expect(screen.getByRole("alert")).toHaveTextContent("That didn't go through. Nothing was charged.");
  });

  it("shows Can't reach Wally with Retry when the first load fails, and Retry loads the budget", async () => {
    window.location.hash = "#/budget";
    const api = new FirstLoadFails();
    render(<App api={api} /> as ReactElement);
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.getByText("Can't reach Wally")).toBeInTheDocument();
    await userEvent.click(retry);
    await waitFor(() => expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED"));
    expect(api.infoCalls).toBe(2);
  });

  it("a screen that throws shows Wally asleep with Try again, not a blank page", async () => {
    const user = userEvent.setup();
    let fail = true;
    const Boom = (): ReactElement => {
      if (fail) throw new Error("boom");
      return <p>recovered</p>;
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<ErrorBoundary resetKey="a"><Boom /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong here");
    expect(screen.getByRole("link", { name: "Go to your budget" })).toHaveAttribute("href", "#/budget");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("recovered")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("the skip link moves focus to the screen without changing the route", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(screen.getByRole("link", { name: "Skip to content" }));
    expect(document.activeElement).toBe(document.getElementById("main"));
    expect(window.location.hash).toBe("#/budget");
    await screenReady();
  });
});
