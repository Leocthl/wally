// Home after the ux pass: the way in ("What do you need?") sits right under Wally's greeting and above the budget card, a waiting
// question comes before it, a finished budget puts its one card there instead, and the iOS Add to Home Screen card waits for a
// first purchase or a second visit and sits below Recent, never above the greeting.
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IOS_HINT_KEY } from "../src/pwa/InstallUi";
import { VISITS_KEY } from "../src/pwa/visits";
import { bootApp, go, press } from "./helpers/app";

vi.setConfig({ testTimeout: 30_000 });

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const hint = () => screen.queryByRole("complementary", { name: "Add Wally to your Home Screen" });
const composer = () => screen.getByRole("button", { name: "What do you need?" });
const part = (selector: string): Element => document.querySelector(selector)!;
const iPhone = () => vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(IPHONE_SAFARI);

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("the way in is the first thing under Wally's hello", () => {
  it("is the composer, then the budget card", async () => {
    await bootApp("#/budget");
    expect(part(".home-hero__greet").nextElementSibling).toBe(part(".home-ask"));
    expect(part(".home-ask").contains(composer())).toBe(true);
    expect(part(".home-ask").nextElementSibling).toBe(part(".home-hero__card"));
  });

  it("puts a waiting question before the composer, because it has a clock", async () => {
    const h = await bootApp("#/budget");
    await press(h, "unverified");
    await go("#/budget");
    const question = await screen.findByRole("region", { name: "Wally needs your OK" });
    expect(part(".home-hero__greet").nextElementSibling).toBe(question);
    expect(question.compareDocumentPosition(composer()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("puts the one card that starts a new budget there once the budget is over, and no composer", async () => {
    const h = await bootApp("#/budget");
    await h.api.revoke();
    await waitFor(() => expect(document.querySelector(".home-ended")).not.toBeNull());
    expect(part(".home-hero__greet").nextElementSibling).toBe(part(".home-ended"));
    expect(part(".home-ended").nextElementSibling).toBe(part(".home-hero__card"));
    expect(document.querySelector("[data-composer]")).toBeNull();
  });

  it("keeps the figures and the meter on the budget card", async () => {
    await bootApp("#/budget");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
    expect(part(".home-hero__card").textContent).toContain("HK$800");
  });
});

describe("the Add to Home Screen card", () => {
  it("is not there for someone on a first visit with nothing bought yet", async () => {
    iPhone();
    await bootApp("#/budget");
    expect(hint()).toBeNull();
  });

  it("appears below Recent after the first purchase went through", async () => {
    iPhone();
    const h = await bootApp("#/budget");
    await press(h, "normal");
    await go("#/budget");
    const card = await screen.findByRole("complementary", { name: "Add Wally to your Home Screen" });
    const recent = screen.getByRole("heading", { name: "Recent" });
    const demo = part("[data-demo-disclosure]");
    expect(recent.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(demo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(part(".home-hero").compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not appear after a purchase that was stopped: nothing was bought", async () => {
    iPhone();
    const h = await bootApp("#/budget");
    await press(h, "off_category");
    await go("#/budget");
    expect(hint()).toBeNull();
  });

  it("appears on a second visit", async () => {
    iPhone();
    await bootApp("#/budget", { [VISITS_KEY]: "1" });
    expect(await screen.findByRole("complementary", { name: "Add Wally to your Home Screen" })).toBeInTheDocument();
  });

  it("stays away once it was dismissed, and off iOS Safari", async () => {
    iPhone();
    await bootApp("#/budget", { [VISITS_KEY]: "1", [IOS_HINT_KEY]: "1" });
    expect(hint()).toBeNull();
  });

  it("never shows in a browser that cannot add to a home screen this way", async () => {
    await bootApp("#/budget", { [VISITS_KEY]: "5" });
    expect(hint()).toBeNull();
  });
});
