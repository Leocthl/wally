// #/styleguide: renders outside the booth shell, shows every section, switches language with lang attributes on every
// Chinese run, keeps drawings hidden from assistive tech, and leaves the page theme as it found it.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isStyleGuideHash } from "../src/screens/StyleGuideRoute";
import StyleGuide from "../src/screens/StyleGuide";
import { bootApp } from "./helpers/app";

vi.setConfig({ testTimeout: 20_000 });

afterEach(() => {
  window.localStorage.clear();
  window.location.hash = "";
});

const CJK = new RegExp("[\\u3000-\\u303f\\u3400-\\u9fff\\uff00-\\uffef]");

function chineseOutsideZh(): string[] {
  const bad: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    if (CJK.test(text) && node.parentElement?.closest("[lang]")?.getAttribute("lang") !== "zh-HK") bad.push(text.trim().slice(0, 30));
  }
  return bad;
}

describe("style guide route", () => {
  it("matches #/styleguide only", () => {
    expect(["#/styleguide", "#styleguide", "#/styleguide?x=1"].map(isStyleGuideHash)).toEqual([true, true, true]);
    expect(["#/booth", "#/styleguides", ""].map(isStyleGuideHash)).toEqual([false, false, false]);
  });

  it("App renders the style guide instead of the booth shell on #/styleguide", async () => {
    window.location.hash = "#/styleguide";
    const { MockApiClient } = await import("../src/api/MockApiClient");
    const { App } = await import("../src/App");
    render(<App api={new MockApiClient({ sleep: async () => undefined, pace: 0 })} />);
    expect(await screen.findByRole("heading", { level: 2, name: "Screens" })).toBeInTheDocument();
    expect(document.querySelector(".shell-bar")).toBeNull();
  });

  it("the booth still boots on #/booth", async () => {
    await bootApp("#/booth");
    expect(document.querySelector(".shell-bar")).not.toBeNull();
  });
});

describe("style guide page", () => {
  it("shows every section and every sample screen", () => {
    render(<StyleGuide />);
    for (const name of ["Screens", "Wally", "Colour", "Type", "Components", "Install"]) expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    for (const name of ["Budget home", "Wally is shopping", "Approved", "Stopped", "Proof"]) expect(screen.getByRole("figure", { name })).toBeInTheDocument();
  });

  it("switches to zh-HK with every Chinese run marked lang=zh-HK, and back", async () => {
    render(<StyleGuide />);
    await userEvent.click(screen.getByRole("radio", { name: "繁體中文" }));
    expect(document.querySelector(".sg")).toHaveAttribute("lang", "zh-HK");
    expect(screen.getAllByText("預算剩餘").length).toBeGreaterThan(0);
    expect(chineseOutsideZh()).toEqual([]);
    expect(window.localStorage.getItem("wally:lang")).toBe("zh-HK");
    await userEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(screen.getAllByText("Budget left").length).toBeGreaterThan(0);
  });

  it("hides every drawing from assistive tech and names every button", () => {
    render(<StyleGuide />);
    for (const svg of document.querySelectorAll("svg")) expect(svg.getAttribute("aria-hidden")).toBe("true");
    for (const b of screen.getAllByRole("button")) expect(b.textContent?.trim() || b.getAttribute("aria-label"), b.outerHTML.slice(0, 80)).toBeTruthy();
  });

  it("sets the theme and palette on <html> while open and clears them on leave", async () => {
    const { unmount } = render(<StyleGuide />);
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await userEvent.click(screen.getByRole("radio", { name: "Warm" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveAttribute("data-palette", "warm");
    unmount();
    await waitFor(() => expect(document.documentElement).not.toHaveAttribute("data-theme"));
    expect(document.documentElement).not.toHaveAttribute("data-palette");
  });

  it("opens the Why sheet from the Stopped screen and shows the rule id only there", async () => {
    render(<StyleGuide />);
    const stopped = screen.getByRole("figure", { name: "Stopped" });
    expect(stopped.textContent).not.toMatch(/\bR3\b/);
    await userEvent.click(screen.getAllByRole("button", { name: "Why?" })[0]!);
    expect(screen.getByRole("dialog", { name: "Why Wally stopped" })).toHaveTextContent("R3");
  });
});
