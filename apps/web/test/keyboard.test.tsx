// Keyboard operation (docs/04 Accessibility): everything a visitor can press is a real control that works with Enter, Space
// and arrow keys, with a visible focus ring and 44 px targets. Try asking and the bottom tabs replace the old picker and
// booth tabs (lane b-shell).
import { readFileSync } from "node:fs";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PresenterBar } from "../src/components/PresenterBar";
import { TryAsking } from "../src/screens/home/TryAsking";
import { PRESENTER_SCRIPT } from "../src/booth/presenterScript";
import { bootApp } from "./helpers/app";
import { TOKENS_CSS } from "./helpers/contrast";

vi.setConfig({ testTimeout: 20_000 });

describe("Try asking cards by keyboard", () => {
  it.each(["{Enter}", " "])("runs a card with %j", async (key) => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    render(<TryAsking onRun={onRun} busy={false} />);
    document.querySelector<HTMLButtonElement>('[data-scenario="flagged"]')!.focus();
    await user.keyboard(key);
    expect(onRun).toHaveBeenCalledWith("flagged");
  });

  it("reaches every card with Tab in reading order, Buy first", async () => {
    const user = userEvent.setup();
    render(<TryAsking onRun={() => undefined} busy={false} />);
    const stops: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      if (el === document.body) break;
      stops.push(el.dataset["scenario"] ?? el.tagName.toLowerCase());
    }
    expect(stops.slice(0, 3)).toEqual(["normal", "small", "flagged"]);
    expect(stops).toHaveLength(13);
    expect(stops.at(-1)).toBe("revoke");
  });

  it("disables presses while a run is in flight so nothing is double-sent", () => {
    render(<TryAsking onRun={() => undefined} busy />);
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-scenario]")) expect(b).toBeDisabled();
  });
});

describe("PresenterBar by keyboard", () => {
  const base = { steps: PRESENTER_SCRIPT, mode: "SIMULATED" as const, realCapture: null, busy: false, onSkip: () => undefined, onReset: () => undefined, onMode: () => undefined };

  it("steps with Enter and shows the next moment", async () => {
    const user = userEvent.setup();
    const onStep = vi.fn();
    render(<PresenterBar {...base} index={0} onStep={onStep} />);
    expect(screen.getByText("DM1")).toBeInTheDocument();
    screen.getByRole("button", { name: /^Step/ }).focus();
    await user.keyboard("{Enter}");
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it("keeps REAL disabled with a reason until a capture exists, and SIMULATED is the default", () => {
    render(<PresenterBar {...base} index={0} onStep={() => undefined} />);
    expect(screen.getByRole("radio", { name: /REAL/ })).toBeDisabled();
    expect(screen.getByText(/no capture yet/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /SIMULATED/ })).toBeChecked();
  });

  it("offers Skip only for the optional beat (DM6)", () => {
    const dm6 = PRESENTER_SCRIPT.findIndex((s) => s.moment === "DM6");
    const { rerender } = render(<PresenterBar {...base} index={0} onStep={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    rerender(<PresenterBar {...base} index={dm6} onStep={() => undefined} />);
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
  });

  it("disables Step at the end of the script", () => {
    render(<PresenterBar {...base} index={PRESENTER_SCRIPT.length} onStep={() => undefined} />);
    expect(screen.getByRole("button", { name: /^Step/ })).toBeDisabled();
  });
});

describe("bottom tabs by keyboard", () => {
  it("are links in reading order with the raised Ask button in the middle, and the current one marked", async () => {
    const h = await bootApp();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const names = [...nav.querySelectorAll("a, button")].map((el) => el.textContent?.trim());
    expect(names).toEqual(["Budget", "Wally", "Ask", "Receipts", "Proof"]);
    expect(screen.getByRole("link", { name: "Budget" })).toHaveAttribute("aria-current", "page");
    screen.getByRole("link", { name: "Receipts" }).focus();
    await h.user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("link", { name: "Receipts" })).toHaveAttribute("aria-current", "page"));
  });

  it("opens Ask from the keyboard and runs a card from it", async () => {
    const h = await bootApp();
    screen.getByRole("button", { name: /^Ask$/ }).focus();
    await h.user.keyboard("{Enter}");
    const sheet = await screen.findByRole("dialog", { name: /What should Wally try/ });
    const card = sheet.querySelector<HTMLButtonElement>('[data-scenario="flagged"]')!;
    card.focus();
    await h.user.keyboard(" ");
    await waitFor(() => expect(window.location.hash).toBe("#/wally"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /What should Wally try/ })).toBeNull());
  });
});

describe("focus and targets", () => {
  const css = readFileSync(TOKENS_CSS.replace("tokens.css", "base.css"), "utf8");

  it("draws a 3 px --focus ring on :focus-visible", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--focus\)/);
  });

  it("sets inputs to 16 px and every control to at least the 44 px token", () => {
    expect(css).toMatch(/font-size:\s*1rem;\s*\/\* 16px/);
    expect(css).toMatch(/button[^{]*\{[^}]*min-height:\s*var\(--tap\)/);
    expect(css).toMatch(/button[^{]*\{[^}]*min-width:\s*var\(--tap\)/);
  });
});
