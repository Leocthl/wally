// The first run (src/screens/onboarding): shown once per browser, four short steps (Hello, What can Wally buy for you?, Your first
// budget, the quick tour), Skip always visible, and a judge who taps Skip twice is in the live demo. What a person tells Wally is
// kept on the device and changes only what Wally shows first and where the first budget's form starts.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SealRequest } from "../src/api/types";
import { ONBOARDED_KEY, PROFILE_KEY } from "../src/state/profile";
import { bootApp } from "./helpers/app";
import { buyStep, FamilyMock, hello, kindChip, openFirstRun, skip, skipToTour, skipTour, storedProfile, tourCard } from "./helpers/firstRun";
import { SealAlwaysFails } from "./helpers/shellClients";

vi.setConfig({ testTimeout: 30_000 });

const meter = () => screen.getByRole("meter");
const nextButton = () => screen.getByRole("button", { name: /^Next/ });
const flag = () => window.localStorage.getItem(ONBOARDED_KEY);

describe("the first screen", () => {
  it("is Hello, in place of the app: Wally, the language, a nickname, Skip, and no tab bar", async () => {
    await openFirstRun();
    expect(await hello()).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Setup progress" })).toHaveAttribute("aria-valuetext", "Step 1 of 4");
    expect(screen.getByRole("radiogroup", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "What should Wally call you?" })).toBeInTheDocument();
    expect(skip()).toBeEnabled();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
    expect(document.querySelector("[data-onboarding]")).toHaveAttribute("data-step", "hello");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveFocus();
  });

  it("says the profile stays on this device", async () => {
    await openFirstRun();
    await hello();
    expect(screen.getByText("Saved on this device only. Wally never sends it anywhere.")).toBeInTheDocument();
  });

  it("is not shown when the flag is set (every other test, and a returning visitor)", async () => {
    const h = await bootApp("#/budget");
    expect(screen.queryByRole("heading", { level: 1, name: "Hi, I'm Wally." })).toBeNull();
    expect(meter()).toBeInTheDocument();
    expect(h.api.kind).toBe("mock");
  });

  it("is left alone when the app opens on any other screen: a link to a receipt is not interrupted", async () => {
    await openFirstRun({ hash: "#/proof" });
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Hi, I'm Wally." })).toBeNull();
    expect(flag()).toBeNull();
  });

  it("holds the booth's ready-made budget back while the visitor sets up their own", async () => {
    const { api } = await openFirstRun();
    await hello();
    await waitFor(async () => expect((await api.info()).kind).toBe("mock"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await api.snapshot()).mandate).toBeNull();
  });
});

describe("Skip, Skip: the judge's two taps", () => {
  it("seals the ready-made budget, shows the quick tour on the real Budget screen, and then the live demo", async () => {
    const { api, user } = await openFirstRun();
    await hello();
    await skipToTour(user);
    // The tour is over the real Budget screen, which already has the ready-made HK$800.
    expect((await api.snapshot()).packet?.budget_minor).toBe(80_000);
    expect(meter()).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
    expect(screen.getByRole("dialog", { name: "Ask Wally" })).toBeInTheDocument();
    expect(flag()).toBe("1");
    await skipTour(user);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(meter()).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
    expect(document.querySelector('main [data-scenario="normal"]')).not.toBeNull();
  });

  it("goes straight to the tour when the booth already holds a budget (the live booth pre-seals one)", async () => {
    const { api, user } = await openFirstRun({ sealed: true });
    await hello();
    await skipToTour(user);
    expect((await api.snapshot()).packet?.budget_minor).toBe(80_000);
  });

  it("is shown only once: a reload goes to the app", async () => {
    const { user } = await openFirstRun();
    await hello();
    await skipToTour(user);
    expect(flag()).toBe("1");
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
  });

  it("lets the visitor into the app when the booth could not be reached (Skip is never a dead end); test/onboardingRecovery.test.tsx follows it through", async () => {
    const { FirstLoadFails } = await import("./helpers/shellClients");
    const { user } = await openFirstRun({ api: new FirstLoadFails() });
    await hello();
    await user.click(skip());
    expect(await screen.findByText("Can't reach Wally")).toBeInTheDocument();
    expect(flag()).toBeNull();
  });
});

describe("the four steps", () => {
  it("walks Hello, What can Wally buy for you?, Your first budget and the sealed screen, then the tour, and lands on a personal Budget", async () => {
    const { api, user } = await openFirstRun();
    await hello();
    await user.type(screen.getByRole("textbox", { name: "What should Wally call you?" }), "  Mei ");
    await user.click(nextButton());

    // Step two: what Wally can buy. All four kinds are ticked to start with; the person unticks what they do not want.
    expect(await buyStep()).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Step 2 of 4");
    expect(document.querySelector('[data-onboarding] .wally')).toHaveAttribute("data-state", "thinking");
    const kinds = screen.getByRole("group", { name: "Kinds of purchase" });
    expect(within(kinds).getAllByRole("button").map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Groceries and food", "true"],
      ["Clothes", "true"],
      ["Shoes", "true"],
      ["Gadgets and electronics", "true"],
    ]);
    await user.click(kindChip("Groceries and food"));
    await user.click(kindChip("Gadgets and electronics"));
    await user.click(nextButton());

    // Step three: the first budget, started from what was ticked (clothes and shoes, the ready-made HK$800, verified sellers).
    expect(await screen.findByRole("heading", { level: 1, name: "Your first budget" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "HK$800" })).toBeChecked();
    const what = screen.getByRole("group", { name: "What Wally can buy" });
    expect(within(what).getAllByRole("button").map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Clothes", "true"],
      ["Shoes", "true"],
      ["Electronics", "false"],
      ["Groceries", "false"],
    ]);
    expect(screen.getByRole("switch", { name: "Verified sellers only" })).toBeChecked();
    expect((await api.snapshot()).mandate).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Two weeks" }));
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Check and lock in" })).toBeInTheDocument();
    expect(document.querySelector(".seal-summary")).toHaveTextContent("Clothes, Shoes only");
    await user.click(screen.getByRole("button", { name: /Lock in budget/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Your budget is locked in" })).toBeInTheDocument();
    const snap = await api.snapshot();
    expect(snap.mandate?.rules.budget.amount_minor).toBe(80_000);
    expect(snap.mandate?.rules.categories).toEqual(["apparel", "footwear"]);
    expect(snap.mandate?.rules.seller_check.require_capture).toBe(true);
    expect(snap.mandate?.intent_text).toBe("HK$800 for clothes and shoes over the next 14 days, verified sellers only");
    await user.click(screen.getByRole("button", { name: /^Continue/ }));

    // Step four: the quick tour, three marks.
    expect(await screen.findByRole("dialog", { name: "Ask Wally" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Next/ }));
    expect(await screen.findByRole("dialog", { name: "Ideas for you" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Next/ }));
    expect(await screen.findByRole("dialog", { name: "Find your way" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Done/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // The home screen is personal, and says what the budget can buy.
    expect(screen.getByText("Hi Mei, I'm Wally.")).toBeInTheDocument();
    expect(meter()).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
    expect(screen.getByRole("region", { name: "Your budget" })).toHaveTextContent("Clothes, Shoes only");
    expect(storedProfile()).toEqual({ v: 1, nickname: "Mei", shopFor: ["apparel", "footwear"] });
    expect(flag()).toBe("1");
    // Clothes and shoes name no shelf item of their own: the cards keep the booth's order and carry no "For you" tag.
    const stops = [...document.querySelectorAll<HTMLElement>('main .home-try__group:nth-of-type(2) [data-scenario]')].map((b) => b.dataset["scenario"]);
    expect(stops.slice(0, 2)).toEqual(["flagged", "overflow"]);
    expect(document.querySelectorAll("main [data-for-you]")).toHaveLength(0);
  });

  it("leaves all four kinds ticked and the budget at any category when nothing is touched", async () => {
    const { api, user } = await openFirstRun();
    await hello();
    await user.click(nextButton());
    await buyStep();
    for (const name of ["Groceries and food", "Clothes", "Shoes", "Gadgets and electronics"] as const) expect(kindChip(name)).toHaveAttribute("aria-pressed", "true");
    await user.click(nextButton());
    await screen.findByRole("heading", { level: 1, name: "Your first budget" });
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    await screen.findByRole("heading", { level: 1, name: "Check and lock in" });
    expect(document.querySelector(".seal-summary")).toHaveTextContent("Any category");
    expect(document.querySelector(".seal-summary")).not.toHaveTextContent("Clothes");
    await user.click(screen.getByRole("button", { name: /Lock in budget/ }));
    await screen.findByRole("heading", { level: 1, name: "Your budget is locked in" });
    expect(document.querySelector(".seal-summary")).toHaveTextContent("Any category");
    expect([...((await api.snapshot()).mandate?.rules.categories ?? [])].sort()).toEqual(["apparel", "electronics", "footwear", "groceries"]);
    await user.click(screen.getByRole("button", { name: /^Continue/ }));
    await user.click(await screen.findByRole("button", { name: "Skip tour" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The budget card says Any category, not a list of all four with "only".
    expect(screen.getByRole("region", { name: "Your budget" })).toHaveTextContent("Any category");
    expect(screen.getByRole("region", { name: "Your budget" })).not.toHaveTextContent("Clothes");
    // Nothing was narrowed, so nothing is kept about it.
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
  });

  it("keeps what was typed and ticked when the visitor goes Back", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.type(screen.getByRole("textbox", { name: "What should Wally call you?" }), "Mei");
    await user.click(nextButton());
    await buyStep();
    await user.click(kindChip("Shoes"));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await hello()).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "What should Wally call you?" })).toHaveValue("Mei");
    await user.click(nextButton());
    expect(await screen.findByRole("button", { name: "Shoes" })).toHaveAttribute("aria-pressed", "false");
    expect(kindChip("Clothes")).toHaveAttribute("aria-pressed", "true");
  });

  it("Skip on a later step keeps the steps before it and the one on screen", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.type(screen.getByRole("textbox", { name: "What should Wally call you?" }), "Mei");
    await user.click(nextButton());
    await buyStep();
    await user.click(kindChip("Groceries and food"));
    await skipToTour(user);
    expect(storedProfile()).toEqual({ v: 1, nickname: "Mei", shopFor: ["apparel", "footwear", "electronics"] });
  });

  it("saves nothing when nothing was told", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.click(nextButton());
    await buyStep();
    await user.click(nextButton());
    await screen.findByRole("heading", { level: 1, name: "Your first budget" });
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
  });

  it("saves nothing either when a kind was unticked and ticked again", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.click(nextButton());
    await buyStep();
    await user.click(kindChip("Shoes"));
    await user.click(kindChip("Shoes"));
    await user.click(nextButton());
    await screen.findByRole("heading", { level: 1, name: "Your first budget" });
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
  });

  it("a kind toggles off and on, and none ticked says the first budget will allow any category", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.click(nextButton());
    await buyStep();
    const shoes = kindChip("Shoes");
    await user.click(shoes);
    expect(shoes).toHaveAttribute("aria-pressed", "false");
    await user.click(shoes);
    expect(shoes).toHaveAttribute("aria-pressed", "true");
    const hint = document.querySelector("[data-buy-hint]");
    expect(hint).toHaveTextContent("Optional. Leave all four ticked for any category. You can change this on the next step.");
    for (const name of ["Groceries and food", "Clothes", "Shoes", "Gadgets and electronics"] as const) await user.click(kindChip(name));
    expect(hint).toHaveTextContent("Nothing ticked, so your first budget will allow any category.");
    // The form that follows starts from all four, as it would have with every kind ticked.
    await user.click(nextButton());
    await screen.findByRole("heading", { level: 1, name: "Your first budget" });
    const what = screen.getByRole("group", { name: "What Wally can buy" });
    for (const button of within(what).getAllByRole("button")) expect(button).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
  });

  it("says the demo shop stocks only some of the kinds, and that the ticks are saved on this device only", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.click(nextButton());
    await buyStep();
    expect(screen.getByText("The demo shop stocks only some of these.")).toBeInTheDocument();
    // The picks are kept on the device; the line does not promise that the budget's rules, which they start, never leave it.
    expect(screen.getByText("Your picks are saved on this device only.")).toBeInTheDocument();
    expect(screen.queryByText(/never sends it anywhere/)).toBeNull();
    expect(screen.getByRole("group", { name: "Kinds of purchase" })).toHaveAccessibleDescription(/Leave all four ticked for any category/);
  });

  it("asks nothing about style, colours or sizes", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.click(nextButton());
    await buyStep();
    const step = document.querySelector("[data-onboarding]");
    expect(step).not.toBeNull();
    for (const old of [/style/i, /colou?rs?/i, /sizes?/i, /wear/i, /taste/i, /streetwear/i, /smart casual/i]) expect(step?.textContent ?? "", String(old)).not.toMatch(old);
    expect(document.querySelectorAll("[data-swatch-id], [data-size]")).toHaveLength(0);
    expect(screen.queryByRole("group", { name: "Top" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Shoes (EU)" })).toBeNull();
  });
});

describe("Your first budget", () => {
  async function toBudget(options: Parameters<typeof openFirstRun>[0] = {}) {
    const run = await openFirstRun(options);
    await hello();
    await run.user.click(nextButton());
    await buyStep();
    await run.user.click(nextButton());
    return run;
  }

  it("offers HK$300, 500, 800 and 1,200 and a custom amount, starting at the ready-made HK$800", async () => {
    await toBudget();
    const group = await screen.findByRole("radiogroup", { name: "How much?" });
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual(["HK$300", "HK$500", "HK$800", "HK$1,200", "Custom"]);
    expect(within(group).getByRole("radio", { name: "HK$800" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "This month" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Verified sellers only" })).toBeChecked();
    // Every figure is SIMULATED and the section shows that once.
    expect(document.querySelectorAll('.onb-body[data-chip-scope] > .chip-scope__chips [data-prov="SIMULATED"]')).toHaveLength(1);
  });

  it("moves between the amounts with the arrow keys, one tab stop in the group", async () => {
    const { user } = await toBudget();
    const group = await screen.findByRole("radiogroup", { name: "How much?" });
    const chosen = within(group).getByRole("radio", { name: "HK$800" });
    expect(chosen).toHaveAttribute("tabindex", "0");
    expect(within(group).getByRole("radio", { name: "HK$300" })).toHaveAttribute("tabindex", "-1");
    chosen.focus();
    await user.keyboard("{ArrowRight}");
    expect(within(group).getByRole("radio", { name: "HK$1,200" })).toBeChecked();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(within(group).getByRole("radio", { name: "HK$300" })).toBeChecked();
  });

  it("seals a typed amount, and says what is wrong with an empty one in the Seal screen's words", async () => {
    const { api, user } = await toBudget();
    await user.click(await screen.findByRole("radio", { name: "Custom" }));
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    expect(screen.getByText("Enter an amount above zero.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Your first budget" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /^Amount/ }), "650");
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Check and lock in" })).toBeInTheDocument();
    expect(document.querySelector(".seal-summary")).toHaveTextContent("HK$650");
    await user.click(screen.getByRole("button", { name: /Lock in budget/ }));
    await screen.findByRole("heading", { level: 1, name: "Your budget is locked in" });
    expect((await api.snapshot()).packet?.budget_minor).toBe(65_000);
  });

  it("starts with all four categories ticked", async () => {
    await toBudget();
    const what = await screen.findByRole("group", { name: "What Wally can buy" });
    expect(within(what).getAllByRole("button").map((b) => b.textContent)).toEqual(["Clothes", "Shoes", "Electronics", "Groceries"]);
    for (const button of within(what).getAllByRole("button")) expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("will not go on without a category", async () => {
    const { user } = await toBudget();
    const what = await screen.findByRole("group", { name: "What Wally can buy" });
    for (const button of within(what).getAllByRole("button")) await user.click(button);
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    expect(screen.getByText("Pick at least one thing Wally can buy.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Your first budget" })).toBeInTheDocument();
  });

  it("a date beyond what a budget may run is cut to the latest day, with a note", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-03T02:00:00Z") });
    try {
      const { user } = await toBudget();
      await user.click(await screen.findByRole("radio", { name: "Pick a date" }));
      const until = screen.getByLabelText(/^Until/) as HTMLInputElement;
      expect(until).toHaveAttribute("min", "2026-10-03");
      expect(until).toHaveAttribute("max", "2026-11-03");
      fireEvent.change(until, { target: { value: "2027-01-01" } });
      expect(screen.getByText("A budget can run for a month at most, so the date is set to the latest day.")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Back from the budget returns to what Wally can buy, which is as it was left", async () => {
    const { user } = await toBudget();
    await user.click(await screen.findByRole("button", { name: "Back" }));
    expect(await buyStep()).toBeInTheDocument();
    expect(kindChip("Clothes")).toHaveAttribute("aria-pressed", "true");
  });

  it("starts the form over from the new ticks when they change after Back", async () => {
    const { user } = await toBudget();
    await user.click(await screen.findByRole("radio", { name: "HK$1,200" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    await buyStep();
    await user.click(kindChip("Groceries and food"));
    await user.click(nextButton());
    const what = await screen.findByRole("group", { name: "What Wally can buy" });
    expect(within(what).getByRole("button", { name: "Groceries" })).toHaveAttribute("aria-pressed", "false");
    expect(within(what).getByRole("button", { name: "Clothes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("radio", { name: "HK$800" })).toBeChecked();
  });

  it("keeps the form when the ticks go from none to all four after Back, which is the same budget", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.click(nextButton());
    await buyStep();
    // None ticked starts the form on all four, as all four ticked does; the form is then edited.
    for (const name of ["Groceries and food", "Clothes", "Shoes", "Gadgets and electronics"] as const) await user.click(kindChip(name));
    await user.click(nextButton());
    await user.click(await screen.findByRole("radio", { name: "HK$1,200" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    await buyStep();
    for (const name of ["Groceries and food", "Clothes", "Shoes", "Gadgets and electronics"] as const) await user.click(kindChip(name));
    await user.click(nextButton());
    expect(await screen.findByRole("radio", { name: "HK$1,200" })).toBeChecked();
  });

  it("keeps the form as it was when Back and Next change nothing", async () => {
    const { user } = await toBudget();
    await user.click(await screen.findByRole("radio", { name: "HK$1,200" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    await buyStep();
    await user.click(nextButton());
    expect(await screen.findByRole("radio", { name: "HK$1,200" })).toBeChecked();
  });

  it("Edit on Check and lock in returns to the form with the choices kept", async () => {
    const { user } = await toBudget();
    await user.click(await screen.findByRole("radio", { name: "HK$1,200" }));
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    await screen.findByRole("heading", { level: 1, name: "Check and lock in" });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("radio", { name: "HK$1,200" })).toBeChecked();
  });

  it("stays on Check and lock in when sealing fails, and says nothing was charged", async () => {
    const { user } = await toBudget({ api: new SealAlwaysFails() });
    await user.click(await screen.findByRole("button", { name: "Review budget" }));
    await user.click(await screen.findByRole("button", { name: /Lock in budget/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("That didn't go through. Nothing was charged."));
    expect(screen.getByRole("heading", { level: 1, name: "Check and lock in" })).toBeInTheDocument();
    expect(screen.queryByText("Your budget is locked in")).toBeNull();
  });

  it("skips the form when the booth already holds a budget: Your budget is ready, then Continue", async () => {
    const { user } = await toBudget({ sealed: true });
    expect(await screen.findByRole("heading", { level: 1, name: "Your budget is ready" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "How much?" })).toBeNull();
    expect(document.querySelector(".seal-summary")).toHaveTextContent("HK$800");
    await user.click(screen.getByRole("button", { name: /^Continue/ }));
    expect(await tourCard()).toBeInTheDocument();
  });

  it("asks whose money it is when the booth offers family budgets, and not otherwise", async () => {
    const { user } = await toBudget({ api: new FamilyMock() });
    expect(await screen.findByRole("radiogroup", { name: "Whose money?" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Mum's budget" }));
    await waitFor(() => expect(document.querySelector("[data-family-card]")).not.toBeNull());
    expect(screen.getByRole("radio", { name: "Mum's budget" })).toBeChecked();
  });

  it("shows no such choice on a booth without family budgets", async () => {
    await toBudget();
    await screen.findByRole("radiogroup", { name: "How much?" });
    expect(screen.queryByRole("radiogroup", { name: "Whose money?" })).toBeNull();
  });
});

describe("in 繁體", () => {
  it("switches the language on the first screen and every Chinese run is marked zh-HK", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.click(screen.getByRole("radio", { name: "繁體中文" }));
    expect(await screen.findByRole("heading", { level: 1, name: "你好，我係 Wally。" })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "zh-HK");
    expect(document.querySelector("[data-onboarding]")).toHaveAttribute("lang", "zh-HK");
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await screen.findByRole("heading", { level: 1, name: "Wally 可以幫你買啲咩？" });
    const cjk = new RegExp("[\\u3000-\\u303f\\u3400-\\u9fff\\uff00-\\uffef]");
    const bad: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      if (cjk.test(text) && node.parentElement?.closest("[lang]")?.getAttribute("lang") !== "zh-HK") bad.push(text.trim().slice(0, 30));
    }
    expect(bad).toEqual([]);
    // The four kinds, in 繁體, all ticked.
    const kinds = screen.getByRole("group", { name: "購買類別" });
    expect(within(kinds).getAllByRole("button").map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["雜貨同食品", "true"],
      ["衣物", "true"],
      ["鞋", "true"],
      ["電子產品同小工具", "true"],
    ]);
    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(await screen.findByRole("heading", { level: 1, name: "你的第一個預算" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "略過" })).toBeInTheDocument();
  });

  it("calls a budget that names all four categories 任何類別", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.click(screen.getByRole("radio", { name: "繁體中文" }));
    await user.click(await screen.findByRole("button", { name: "下一步" }));
    await screen.findByRole("heading", { level: 1, name: "Wally 可以幫你買啲咩？" });
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await screen.findByRole("heading", { level: 1, name: "你的第一個預算" });
    await user.click(screen.getByRole("button", { name: "檢查預算" }));
    await screen.findByRole("heading", { level: 1, name: "檢查並鎖定" });
    expect(document.querySelector(".seal-summary")).toHaveTextContent("任何類別");
  });
});

describe("the quick tour", () => {
  it("opens on Ask, with focus on the card, and Escape ends it", async () => {
    const { user } = await openFirstRun();
    await hello();
    await skipToTour(user);
    const card = screen.getByRole("dialog", { name: "Ask Wally" });
    await waitFor(() => expect(card).toHaveFocus());
    expect(card).toHaveAccessibleDescription(/Tap here, or the Ask button, to say what you need/);
    expect(within(card).getByText("1 of 3")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("swallows taps meant for the page behind it", async () => {
    const { user } = await openFirstRun();
    await hello();
    await skipToTour(user);
    expect(document.querySelector(".tour__block")).not.toBeNull();
    expect(document.querySelector('[data-tour-overlay]')).toHaveAttribute("lang", "en");
  });

  it("the last mark says Done", async () => {
    const { user } = await openFirstRun();
    await hello();
    await skipToTour(user);
    await user.click(screen.getByRole("button", { name: /^Next/ }));
    await user.click(await screen.findByRole("button", { name: /^Next/ }));
    expect(await screen.findByRole("button", { name: /^Done/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Next/ })).toBeNull();
  });
});

describe("a failed profile store (private mode)", () => {
  it("still walks the whole flow, and does not show it again on the same page", async () => {
    const { user } = await openFirstRun();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    try {
      await hello();
      await user.type(screen.getByRole("textbox", { name: "What should Wally call you?" }), "Mei");
      await user.click(nextButton());
      await buyStep();
      await skipToTour(user);
      await skipTour(user);
      expect(screen.getByText("Hi Mei, I'm Wally.")).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("storage that holds nonsense", () => {
  it("a corrupt profile is ignored and the app greets as it always did", async () => {
    window.localStorage.setItem(PROFILE_KEY, "{{{ not json");
    await bootApp("#/budget");
    expect(screen.getByText("Hi, I'm Wally.")).toBeInTheDocument();
  });
});

describe("Skip is on every step, and never a dead end", () => {
  it("is there and enabled on Hello, What can Wally buy for you?, the form, Check and lock in and the sealed screen", async () => {
    const { user } = await openFirstRun();
    await hello();
    expect(skip()).toBeEnabled();
    await user.click(nextButton());
    await buyStep();
    expect(skip()).toBeEnabled();
    await user.click(nextButton());
    await screen.findByRole("heading", { level: 1, name: "Your first budget" });
    expect(skip()).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    await screen.findByRole("heading", { level: 1, name: "Check and lock in" });
    expect(skip()).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Lock in budget/ }));
    await screen.findByRole("heading", { level: 1, name: "Your budget is locked in" });
    expect(skip()).toBeEnabled();
    await user.click(skip());
    expect(await tourCard()).toBeInTheDocument();
  });
});

describe("what the person tells Wally stays on the device", () => {
  it("never reaches the booth: the only call the first run makes carries the budget's own rules", async () => {
    const { MockApiClient } = await import("../src/api/MockApiClient");
    const { FakeClock } = await import("@wally/core/testing");
    class Recording extends MockApiClient {
      readonly sent: string[] = [];
      constructor() {
        super({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
      }
      override seal(req: SealRequest) {
        this.sent.push(JSON.stringify(req));
        return super.seal(req);
      }
    }
    const api = new Recording();
    const { user } = await openFirstRun({ api });
    await hello();
    await user.type(screen.getByRole("textbox", { name: "What should Wally call you?" }), "Zed");
    await user.click(nextButton());
    await buyStep();
    await user.click(kindChip("Groceries and food"));
    await user.click(nextButton());
    await screen.findByRole("heading", { level: 1, name: "Your first budget" });
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    await user.click(await screen.findByRole("button", { name: /Lock in budget/ }));
    await screen.findByRole("heading", { level: 1, name: "Your budget is locked in" });
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0], "the name").not.toContain("Zed");
    // What the budget can buy is its rule, so it is in the call; the profile (name, kinds) stays in the page.
    expect(api.sent[0]).toContain("apparel");
    expect(api.sent[0]).not.toContain("groceries");
    expect(window.localStorage.getItem(PROFILE_KEY)).toContain("Zed");
  });
});
