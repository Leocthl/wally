// Keyboard operation (docs/04 Accessibility): everything a visitor can press is a real control that works with Enter, Space
// and arrow keys, with a visible focus ring and 44 px targets.
import { readFileSync } from "node:fs";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PresenterBar } from "../src/components/PresenterBar";
import { ScenarioPicker } from "../src/components/ScenarioPicker";
import { PRESENTER_SCRIPT } from "../src/booth/presenterScript";
import { bootApp } from "./helpers/app";
import { TOKENS_CSS } from "./helpers/contrast";

vi.setConfig({ testTimeout: 20_000 });

describe("ScenarioPicker by keyboard", () => {
  it.each(["{Enter}", " "])("activates a preset with %j", async (key) => {
    const user = userEvent.setup();
    const onScenario = vi.fn();
    render(<ScenarioPicker onScenario={onScenario} onPropose={() => undefined} onReset={() => undefined} busy={false} standIn />);
    const button = document.querySelector<HTMLButtonElement>('[data-scenario="flagged"]')!;
    button.focus();
    await user.keyboard(key);
    expect(onScenario).toHaveBeenCalledWith("flagged");
  });

  it("reaches every control with Tab in reading order and ends on the textarea form", async () => {
    const user = userEvent.setup();
    render(<ScenarioPicker onScenario={() => undefined} onPropose={() => undefined} onReset={() => undefined} busy={false} standIn={false} />);
    const stops: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      if (el === document.body) break;
      stops.push(el.dataset["scenario"] ?? el.tagName.toLowerCase());
    }
    expect(stops.slice(0, 3)).toEqual(["normal", "small", "flagged"]);
    expect(stops).toContain("textarea");
    expect(stops.at(-1)).toBe("button");
  });

  it("disables presses while a run is in flight so nothing is double-sent", () => {
    render(<ScenarioPicker onScenario={() => undefined} onPropose={() => undefined} onReset={() => undefined} busy standIn={false} />);
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-scenario]")) expect(b).toBeDisabled();
  });

  it("submits the typed listing with the Send button and clears nothing it was not asked to", async () => {
    const user = userEvent.setup();
    const onPropose = vi.fn();
    render(<ScenarioPicker onScenario={() => undefined} onPropose={onPropose} onReset={() => undefined} busy={false} standIn={false} />);
    await user.click(screen.getByRole("textbox", { name: /Try to trick the agent/ }));
    await user.paste("  plain tee  ");
    await user.click(screen.getByRole("button", { name: /Send to the agent/ }));
    expect(onPropose).toHaveBeenCalledWith("plain tee");
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

describe("booth tabs by keyboard", () => {
  it("moves between Packet, Run and Log with the arrow keys, Home and End (roving tabindex)", async () => {
    const h = await bootApp();
    const tab = (name: string) => screen.getByRole("tab", { name: new RegExp(`^${name}`) });
    expect(tab("Run")).toHaveAttribute("aria-selected", "true");
    tab("Run").focus();
    await h.user.keyboard("{ArrowRight}");
    expect(tab("Log")).toHaveAttribute("aria-selected", "true");
    expect(tab("Log")).toHaveFocus();
    await h.user.keyboard("{ArrowRight}");
    expect(tab("Packet")).toHaveAttribute("aria-selected", "true");
    await h.user.keyboard("{End}");
    expect(tab("Log")).toHaveAttribute("aria-selected", "true");
    await h.user.keyboard("{Home}");
    expect(tab("Packet")).toHaveAttribute("aria-selected", "true");
    expect(tab("Run")).toHaveAttribute("tabindex", "-1");
  });

  it("runs a scenario from the keyboard and moves to the Packet tab for Revoke", async () => {
    const h = await bootApp();
    const revoke = document.querySelector<HTMLButtonElement>('[data-scenario="revoke"]')!;
    revoke.focus();
    await h.user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("tab", { name: /^Packet/ })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByRole("button", { name: /Hold to revoke/ })).toBeInTheDocument();
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
