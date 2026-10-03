// The quick tour is modal: a tap on the dimmed page keeps focus on the card, Escape ends it wherever focus is, the page behind is
// inert while it runs, Next keeps focus on Next (and later marks are announced), and leaving Budget during the tour ends it.
// (A replay from another screen lands on Budget first: test/onboardingPersonal.test.tsx.)
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { hello, openFirstRun, skipToTour } from "./helpers/firstRun";

vi.setConfig({ testTimeout: 30_000 });

const card = () => screen.getByRole("dialog", { name: "Ask Wally" });
const overlay = () => document.querySelector<HTMLElement>("[data-tour-overlay]");

async function startTour() {
  const run = await openFirstRun();
  await hello();
  await skipToTour(run.user);
  const first = card();
  await waitFor(() => expect(first).toHaveFocus());
  return run;
}

describe("the tour holds the page", () => {
  it("keeps focus on the card when the dimmed page is tapped", async () => {
    const { user } = await startTour();
    await user.click(document.querySelector(".tour__block") as HTMLElement);
    expect(card()).toHaveFocus();
  });

  it("ends on Escape even when focus has slipped off the card", async () => {
    await startTour();
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("makes the page behind inert while it runs, and gives it back when it ends", async () => {
    const { user } = await startTour();
    const behind = [...document.body.children].filter((el) => !el.contains(overlay()));
    expect(behind.length).toBeGreaterThan(0);
    for (const el of behind) expect(el, el.className).toHaveAttribute("inert");
    expect(overlay()).not.toHaveAttribute("inert");
    await user.click(screen.getByRole("button", { name: "Skip tour" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.querySelectorAll("[inert]")).toHaveLength(0);
  });
});

describe("Next", () => {
  it("leaves focus on Next, so a keyboard can press it again, and announces the next mark", async () => {
    const { user } = await startTour();
    const next = screen.getByRole("button", { name: /^Next/ });
    await user.click(next);
    expect(await screen.findByRole("dialog", { name: "Ideas for you" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Next/ })).toHaveFocus();
    const live = within(screen.getByRole("dialog")).getByText("Ideas for you").closest("[aria-live]");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent(/Tap an idea and Wally shops for it/);
  });
});

describe("where the tour ends", () => {
  it("ends when the visitor leaves Budget, and does not start again on the way back", async () => {
    await startTour();
    window.location.hash = "#/receipts";
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    window.location.hash = "#/budget";
    await screen.findByRole("meter");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
