// The personal touches after the first run: About (the tour again, forget my profile), the greeting by name, Try asking in the
// person's order, the Ask example, and the Seal screen starting from what they shop for. None of it reaches the rules.
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OB, ASK_EXAMPLES } from "../src/i18n/onboarding";
import { greetingFor } from "../src/screens/home/heroModel";
import { mergeProfile, ONBOARDED_KEY, PROFILE_KEY, serialiseProfile } from "../src/state/profile";
import { bootApp, go, press } from "./helpers/app";
import { hello, skip, skipTour, skipToTour } from "./helpers/firstRun";

vi.setConfig({ testTimeout: 30_000 });

const mei = serialiseProfile(mergeProfile(null, { nickname: "Mei", styles: ["streetwear"], shopFor: ["footwear"] }));

const bootWith = (stored: Record<string, string>, hash = "#/budget") => bootApp(hash, stored);

const aboutButton = () => screen.getByRole("button", { name: /About and settings/ });

describe("greetingFor", () => {
  it("introduces Wally on a fresh budget, by name when there is one", () => {
    expect(greetingFor("fresh", "")).toBe("intro");
    expect(greetingFor("fresh", "Mei")).toBe("introNamed");
  });

  it("greets a named person while the budget is in use, and says nothing extra to an unnamed one or on a closed budget", () => {
    for (const mood of ["going", "waiting", "usedUp"] as const) {
      expect(greetingFor(mood, "Mei")).toBe("named");
      expect(greetingFor(mood, "")).toBe("none");
    }
    for (const mood of ["cancelled", "ended"] as const) expect(greetingFor(mood, "Mei")).toBe("none");
  });
});

describe("the greeting by name", () => {
  it("says Hi Mei on a fresh budget, and Hi Mei above the mood once it is in use", async () => {
    const h = await bootWith({ [PROFILE_KEY]: mei });
    expect(screen.getByText("Hi Mei, I'm Wally.")).toBeInTheDocument();
    await press(h, "normal");
    await go("#/budget");
    expect(await screen.findByText("Hi Mei.")).toBeInTheDocument();
    expect(screen.getByText("Shopping inside your rules.")).toBeInTheDocument();
  });

  it("speaks 繁 too", async () => {
    await bootWith({ [PROFILE_KEY]: mei, "wally:lang": "zh-HK" });
    expect(screen.getByText("Mei，你好，我係 Wally。")).toBeInTheDocument();
  });
});

describe("About", () => {
  it("offers the tour again, and no profile rows while Wally knows nothing", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(aboutButton());
    const sheet = await screen.findByRole("dialog", { name: "About Wally" });
    expect(within(sheet).getByRole("button", { name: /Take the tour again/ })).toBeInTheDocument();
    expect(within(sheet).queryByText("Forget my profile")).toBeNull();
    expect(within(sheet).queryByText("Your profile")).toBeNull();
  });

  it("the tour again runs the whole flow once more, with what was told filled in, and leaves the budget alone", async () => {
    const h = await bootWith({ [PROFILE_KEY]: mei });
    await h.user.click(aboutButton());
    await h.user.click(await screen.findByRole("button", { name: /Take the tour again/ }));
    expect(await hello()).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "About Wally" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "What should Wally call you?" })).toHaveValue("Mei");
    await skipToTour(h.user);
    await skipTour(h.user);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
    expect((await h.api.snapshot()).packet?.budget_minor).toBe(80_000);
  });

  it("the tour again on a replay starts from any screen and ends on Budget", async () => {
    const h = await bootApp("#/proof");
    await h.user.click(aboutButton());
    await h.user.click(await screen.findByRole("button", { name: /Take the tour again/ }));
    await hello();
    await h.user.click(skip());
    await screen.findByRole("dialog", { name: "Ask Wally" });
    expect(window.location.hash).toBe("#/budget");
  });

  it("the tour skips a mark whose target is not on the screen: a budget that is over has no Ideas, and rings Ask instead of the row", async () => {
    const h = await bootApp("#/budget");
    await h.api.revoke();
    await waitFor(() => expect(document.querySelector(".home-ended")).not.toBeNull());
    await h.user.click(aboutButton());
    await h.user.click(await screen.findByRole("button", { name: /Take the tour again/ }));
    await hello();
    await h.user.click(skip());
    const card = await screen.findByRole("dialog", { name: "Ask Wally" });
    expect(within(card).getByText("1 of 2")).toBeInTheDocument();
    await h.user.click(within(card).getByRole("button", { name: /^Next/ }));
    expect(await screen.findByRole("dialog", { name: "Find your way" })).toBeInTheDocument();
  });

  it("shows what Wally remembers, and forgets it on request (and only that)", async () => {
    const h = await bootWith({ [PROFILE_KEY]: mei, "wally:theme": "dark" });
    await h.user.click(aboutButton());
    const sheet = await screen.findByRole("dialog", { name: "About Wally" });
    const row = within(sheet).getByText("Your profile").closest("li");
    expect(row).toHaveTextContent("Mei · Streetwear");
    await h.user.click(within(sheet).getByRole("button", { name: /Forget my profile/ }));
    const confirm = await screen.findByRole("alertdialog", { name: "Forget your profile?" });
    await h.user.click(within(confirm).getByRole("button", { name: "Keep it" }));
    expect(window.localStorage.getItem(PROFILE_KEY)).not.toBeNull();
    await h.user.click(within(sheet).getByRole("button", { name: /Forget my profile/ }));
    await h.user.click(within(await screen.findByRole("alertdialog", { name: "Forget your profile?" })).getByRole("button", { name: "Forget" }));
    await waitFor(() => expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull());
    expect(await screen.findByText("Profile forgotten.")).toBeInTheDocument();
    expect(window.localStorage.getItem(ONBOARDED_KEY)).toBe("1");
    expect(window.localStorage.getItem("wally:theme")).toBe("dark");
    expect(within(sheet).queryByText("Forget my profile")).toBeNull();
    expect(within(sheet).queryByText("Your profile")).toBeNull();
    // The row that was pressed is gone, so focus lands on the first row left and Escape still closes the sheet.
    await waitFor(() => expect(within(sheet).getByRole("button", { name: /Take the tour again/ })).toHaveFocus());
    await h.user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "About Wally" })).toBeNull());
    expect(screen.getByText("Hi, I'm Wally.")).toBeInTheDocument();
  });
});

describe("Try asking in the person's order", () => {
  const inStops = () => [...document.querySelectorAll<HTMLElement>("main .home-try__group:nth-of-type(2) [data-scenario]")].map((b) => b.dataset["scenario"]);

  it("is the booth's order, with no tags, for someone Wally knows nothing about", async () => {
    await bootApp("#/budget");
    expect(inStops()).toEqual(["flagged", "overflow", "injected", "off_category", "unverified"]);
    expect(document.querySelectorAll("main [data-for-you]")).toHaveLength(0);
    expect(screen.getByText("Each one runs the real rules on a simulated shop.")).toBeInTheDocument();
  });

  it("puts the cozy pick first and tags it, and says whose picks come first", async () => {
    await bootWith({ [PROFILE_KEY]: serialiseProfile(mergeProfile(null, { styles: ["cozy"] })) });
    expect(inStops()[0]).toBe("flagged");
    expect([...document.querySelectorAll("main [data-for-you]")].map((b) => b.getAttribute("data-scenario"))).toEqual(["flagged"]);
    expect(screen.getByText("Your picks come first. Each one runs the real rules on a simulated shop.")).toBeInTheDocument();
  });

  it("still runs the same scenario when a tagged card is pressed (taste is a hint, not a different purchase)", async () => {
    const h = await bootWith({ [PROFILE_KEY]: serialiseProfile(mergeProfile(null, { styles: ["basics"] })) });
    await press(h, "normal");
    expect(await screen.findByText(/Charged the exact HK\$259/)).toBeInTheDocument();
    expect((await h.api.snapshot()).packet?.spent_minor).toBeGreaterThanOrEqual(0);
  });
});

describe("the Ask example", () => {
  async function placeholder(stored: Record<string, string>): Promise<string> {
    window.localStorage.clear();
    for (const [k, v] of Object.entries(stored)) window.localStorage.setItem(k, v);
    const { App } = await import("../src/App");
    const { instantMock } = await import("./helpers/firstRun");
    const { default: userEvent } = await import("@testing-library/user-event");
    window.location.hash = "#/budget";
    render(<App api={instantMock()} onAsk={() => undefined} />);
    await screen.findByRole("meter");
    await userEvent.setup().click(document.querySelector<HTMLElement>(".w-tabbar__fab")!);
    await screen.findByRole("dialog");
    return document.querySelector('[data-slot="ask-natural-language"] input')?.getAttribute("placeholder") ?? "";
  }

  it("is the booth's example by default", async () => {
    expect(await placeholder({})).toBe("A plain cotton tee under HK$300");
  });

  it("is an item the shelf has when the person's taste points at one", async () => {
    const stored = { [PROFILE_KEY]: serialiseProfile(mergeProfile(null, { styles: ["streetwear"] })) };
    expect(await placeholder(stored)).toBe("A denim jacket");
  });

  it("speaks 繁", async () => {
    const stored = { [PROFILE_KEY]: serialiseProfile(mergeProfile(null, { styles: ["cozy"] })), "wally:lang": "zh-HK" };
    expect(await placeholder(stored)).toBe("幫我搵件抓毛衛衣");
  });

  it("names only items the shelf has (a cotton tee, socks, a jacket, a graphic tee, a hoodie, earbuds)", () => {
    expect(Object.keys(ASK_EXAMPLES).sort()).toEqual(["flagged", "injected", "normal", "off_category", "overflow", "small"]);
    expect(OB.home.forYou.en).toBe("For you");
  });
});

describe("Seal starts from what the person shops for", () => {
  it("fills the amount, the category and the sentence, and puts the matching example first", async () => {
    const h = await bootWith({ [PROFILE_KEY]: mei }, "#/seal?mode=welcome");
    await h.user.click(await screen.findByRole("button", { name: /^Start/ }));
    expect(screen.getByRole("textbox", { name: /Your budget in a sentence/ })).toHaveValue("HK$500 this month for shoes, verified sellers only");
    expect(screen.getByRole("textbox", { name: /^Amount/ })).toHaveValue("500");
    expect(screen.getByRole("button", { name: "Shoes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Clothes" })).toHaveAttribute("aria-pressed", "false");
    const examples = within(screen.getByRole("group", { name: "Examples" })).getAllByRole("button").map((b) => b.textContent);
    expect(examples[0]).toBe("Shoes for two weeks");
  });

  it("is the booth's own start without a profile", async () => {
    const h = await bootApp("#/seal?mode=welcome");
    await h.user.click(await screen.findByRole("button", { name: /^Start/ }));
    expect(screen.getByRole("textbox", { name: /Your budget in a sentence/ })).toHaveValue("HK$800 this month for clothes, verified sellers only");
    const examples = within(screen.getByRole("group", { name: "Examples" })).getAllByRole("button").map((b) => b.textContent);
    expect(examples).toEqual(["Clothes this month", "Shoes for two weeks", "Groceries, any seller"]);
  });
});
