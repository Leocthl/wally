// The first run's tab order. The title takes focus when a step arrives, so Tab starts there and goes forward: through the step's own
// controls, then Skip (the top bar on screen, but after the step in the page), then Back and Next. Skip is never the last stop,
// where a keyboard user would only find it by going all the way round or backwards.
import { screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { hello, openFirstRun } from "./helpers/firstRun";

vi.setConfig({ testTimeout: 30_000 });

/** What a stop is called here: the first-run controls by their data attribute, anything else by its role and name. */
function stopName(el: Element | null): string {
  if (el === null) return "none";
  if (el.hasAttribute("data-skip")) return "skip";
  if (el.hasAttribute("data-next")) return "next";
  if (el.hasAttribute("data-back")) return "back";
  return `${el.getAttribute("role") ?? el.tagName.toLowerCase()}:${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 18)}`;
}

/** Tab forward from the title until the focus would leave the step (the last of Back and Next). */
async function stopsFromTitle(user: UserEvent): Promise<readonly string[]> {
  const title = document.querySelector<HTMLElement>("[data-onboarding] h1");
  expect(document.activeElement).toBe(title);
  const stops: string[] = [];
  for (let i = 0; i < 40; i++) {
    await user.tab();
    const name = stopName(document.activeElement);
    stops.push(name);
    if (name === "next") break;
  }
  return stops;
}

const nextButton = () => screen.getByRole("button", { name: /^Next/ });

describe("Tab on the first run's steps", () => {
  it("goes through Hello, then Skip, then Next", async () => {
    const { user } = await openFirstRun();
    await hello();
    const stops = await stopsFromTitle(user);
    expect(stops.at(-1)).toBe("next");
    expect(stops.indexOf("skip")).toBeGreaterThan(0);
    expect(stops.indexOf("skip")).toBeLessThan(stops.indexOf("next"));
    // The name field comes before Skip: the step's own controls are the first stops.
    const field = stops.findIndex((s) => s.startsWith("textbox") || s.startsWith("input"));
    expect(field).toBeGreaterThanOrEqual(0);
    expect(field).toBeLessThan(stops.indexOf("skip"));
  });

  it("puts Skip before Back and Next on Your style and on Your first budget", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.click(nextButton());
    await screen.findByRole("heading", { level: 1, name: "What's your style?" });
    const style = await stopsFromTitle(user);
    expect(style.indexOf("skip")).toBeGreaterThan(0);
    expect(style.indexOf("skip")).toBeLessThan(style.indexOf("back"));
    expect(style.indexOf("back")).toBeLessThan(style.indexOf("next"));
    await user.click(nextButton());
    await screen.findByRole("heading", { level: 1, name: "Your first budget" });
    const budget = await stopsFromTitle(user);
    expect(budget.indexOf("skip")).toBeGreaterThan(0);
    expect(budget.indexOf("skip")).toBeLessThan(budget.indexOf("back"));
    expect(budget.indexOf("back")).toBeLessThan(budget.indexOf("next"));
  });
});
