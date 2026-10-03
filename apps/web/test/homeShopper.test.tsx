// Home as a shopper's screen: Wally's greeting, "What do you need?" and the budget, then Ideas for you, Recent, Manage this budget,
// and last the booth's scenario cards in a disclosure (Demo scenarios, for judges) that is open on the booth Mac and with ?booth=1.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeClock } from "@wally/core/testing";
import { MockApiClient } from "../src/api/MockApiClient";
import type { ApiInfo, AskRequest, RunSummary } from "../src/api/types";
import { DEMO_OPEN_KEY, PRESENTER_KEY } from "../src/screens/home/demoMode";
import { Ideas } from "../src/screens/home/IdeasSection";
import { mergeProfile, PROFILE_KEY, serialiseProfile } from "../src/state/profile";
import { bootApp, go } from "./helpers/app";
import { bareFigures, numsWithoutChip } from "./helpers/figures";

vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

const composer = () => screen.getByRole("button", { name: "What do you need?" });
const disclosure = () => document.querySelector<HTMLDetailsElement>("[data-demo-disclosure]")!;
const profile = (patch: Parameters<typeof mergeProfile>[1]) => ({ [PROFILE_KEY]: serialiseProfile(mergeProfile(null, patch)) });
const ideaIds = () => [...document.querySelectorAll<HTMLElement>("main [data-idea]")].map((b) => b.dataset["idea"]);

describe("the order of Home", () => {
  it("is the greeting, the composer, the budget card, Ideas for you, Recent, the demo scenarios, and Manage this budget last", async () => {
    await bootApp("#/budget");
    const at = (el: Element): Element => el;
    const parts = [
      at(document.querySelector(".home-hero__greet")!),
      at(composer()),
      at(document.querySelector(".home-hero__card")!),
      at(screen.getByRole("heading", { name: "Ideas for you" })),
      at(document.querySelector("[data-recent-empty]")!),
      at(disclosure()),
      at(screen.getByRole("heading", { name: "Manage this budget" })),
    ];
    for (let i = 1; i < parts.length; i += 1) {
      expect(parts[i - 1]!.compareDocumentPosition(parts[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${i - 1} then ${i}`).toBeTruthy();
    }
    // Manage this budget is the last block: the "Cancel the budget" card scrolls to it, and from the cards above it that is a short way.
    expect(disclosure().nextElementSibling).toBe(document.getElementById("budget-console"));
    expect(document.getElementById("budget-console")?.nextElementSibling).toBeNull();
  });

  it("puts the composer right under Wally's greeting, above the budget card", async () => {
    await bootApp("#/budget");
    expect(document.querySelector(".home-hero__greet")?.nextElementSibling).toBe(composer().parentElement);
    expect(composer().parentElement?.nextElementSibling).toBe(document.querySelector(".home-hero__card"));
  });

  it("keeps Wally's greeting and the budget card exactly as they were", async () => {
    await bootApp("#/budget");
    expect(screen.getByText("Hi, I'm Wally.")).toBeInTheDocument();
    expect(screen.getByText("Ready when you are.")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
  });
});

describe("What do you need?", () => {
  it("is one control with the camera and, where the page can listen, the microphone drawn on it, and opens the Ask sheet", async () => {
    vi.stubGlobal("webkitSpeechRecognition", function Recogniser() {});
    const h = await bootApp("#/budget");
    const row = composer();
    expect(row.querySelectorAll('[data-tool="photo"] svg')).toHaveLength(1);
    expect(row.querySelectorAll('[data-tool="voice"] svg')).toHaveLength(1);
    expect(row.querySelectorAll("button, a, input")).toHaveLength(0);
    await h.user.click(row);
    expect(await screen.findByRole("dialog", { name: /What should Wally try/ })).toBeInTheDocument();
  });

  it("draws no microphone where the page has no speech service (the phone apps, some browsers)", async () => {
    await bootApp("#/budget");
    const row = composer();
    expect(row.querySelectorAll('[data-tool="photo"] svg')).toHaveLength(1);
    expect(row.querySelectorAll('[data-tool="voice"]')).toHaveLength(0);
  });

  it("tells the shell which way in was pressed, for the photo lane's entry to read", async () => {
    const h = await bootApp("#/budget");
    const seen: unknown[] = [];
    const listen = (e: Event): void => void seen.push((e as CustomEvent).detail);
    window.addEventListener("wally:ask", listen);
    try {
      await h.user.click(composer());
    } finally {
      window.removeEventListener("wally:ask", listen);
    }
    expect(seen).toEqual([{ entry: "text" }]);
  });

  it("is a 44 px control at least 56 px tall in the design's terms, and reads in 繁", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(screen.getByRole("radio", { name: "繁體中文" }));
    expect(screen.getByRole("button", { name: "你需要啲咩？" })).toHaveClass("home-composer");
  });

  it("is not there when the budget is over, where the card offers a new one instead", async () => {
    const h = await bootApp("#/budget");
    await h.api.revoke();
    await waitFor(() => expect(document.querySelector(".home-ended")).not.toBeNull());
    expect(document.querySelector("[data-composer]")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Ideas for you" })).toBeNull();
  });
});

describe("Ideas for you", () => {
  it("shows four real shelf items to a person Wally knows nothing about", async () => {
    await bootApp("#/budget");
    expect(ideaIds()).toEqual(["tee", "socks", "jacket", "hoodie"]);
    const cards = [...document.querySelectorAll<HTMLElement>("main [data-idea]")];
    expect(cards.map((c) => c.querySelector(".home-try__title")?.textContent)).toEqual(["Cotton tee", "Ankle socks", "Denim jacket", "Fleece hoodie"]);
    expect(document.querySelector('main [data-idea][data-idea-reason]')).toBeNull();
  });

  it("leads with the earbuds for someone who shops for electronics, and says why in the category's name", async () => {
    await bootApp("#/budget", profile({ shopFor: ["electronics"] }));
    expect(ideaIds()).toEqual(["earbuds", "tee", "socks", "jacket"]);
    const earbuds = document.querySelector<HTMLElement>('main [data-idea="earbuds"]')!;
    expect(earbuds).toHaveAttribute("data-idea-reason", "electronics");
    expect(earbuds).toHaveTextContent("Electronics");
  });

  it("keeps the everyday four for categories the shelf has no pick in, and never orders by style, colour or size", async () => {
    await bootApp("#/budget", profile({ shopFor: ["groceries", "footwear"] }));
    expect(ideaIds()).toEqual(["tee", "socks", "jacket", "hoodie"]);
    expect(document.querySelector('main [data-idea][data-idea-reason]')).toBeNull();
  });

  it("reads a profile an old first run stored (styles, colours, sizes) as if they were not there", async () => {
    const old = JSON.stringify({ v: 1, nickname: "Mei", styles: ["streetwear"], colours: ["black"], sizes: { top: "M", bottom: null, shoe: "38" }, shopFor: [] });
    await bootApp("#/budget", { [PROFILE_KEY]: old });
    expect(screen.getByText("Hi Mei, I'm Wally.")).toBeInTheDocument();
    expect(ideaIds()).toEqual(["tee", "socks", "jacket", "hoodie"]);
  });

  it("asks Wally for the item as if it were typed, when the booth can take a typed ask", async () => {
    const asked: AskRequest[] = [];
    class Asking extends MockApiClient {
      constructor() {
        super({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
      }
      override async info(): Promise<ApiInfo> {
        const info = await super.info();
        return { ...info, features: { ...info.features, ask: true } };
      }
      async ask(req: AskRequest): Promise<RunSummary> {
        asked.push(req);
        return { runId: "run_ask00001", scenario: "custom", outcome: "INFO", note: "test" };
      }
    }
    const userEvent = (await import("@testing-library/user-event")).default;
    const { App } = await import("../src/App");
    window.localStorage.clear();
    window.location.hash = "#/budget";
    render(<App api={new Asking()} />);
    await screen.findByRole("meter");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Denim jacket/ }));
    // The card only opens the preview: nothing is asked until its own button is pressed.
    const sheet = await screen.findByRole("dialog", { name: "Denim jacket" });
    expect(asked).toEqual([]);
    expect(window.location.hash).toBe("#/budget");
    await user.click(within(sheet).getByRole("button", { name: "Ask Wally to buy this" }));
    await waitFor(() => expect(asked).toEqual([{ requestText: "a denim jacket", locale: "en" }]));
    expect(window.location.hash).toBe("#/wally");
  });

  it("runs the same item's booth scenario when the booth cannot take a typed ask (the offline mock), after the preview's buy button", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(screen.getByRole("button", { name: /Cotton tee/ }));
    expect(window.location.hash).toBe("#/budget");
    await h.user.click(within(await screen.findByRole("dialog", { name: "Cotton tee" })).getByRole("button", { name: "Ask Wally to buy this" }));
    expect(window.location.hash).toBe("#/wally");
    await waitFor(async () => expect((await h.api.snapshot()).log.entries.some((e) => e.kind === "DECISION")).toBe(true));
    expect((await h.api.snapshot()).packet?.spent_minor).toBeGreaterThanOrEqual(0);
  });

  it("holds the cards while a run is in flight, so nothing is sent twice", () => {
    const { rerender } = render(<Ideas onAsk={() => undefined} busy={false} />);
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-idea]")) expect(b).toBeEnabled();
    rerender(<Ideas onAsk={() => undefined} busy />);
    expect(document.querySelectorAll("[data-idea]")).toHaveLength(4);
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-idea]")) expect(b).toBeDisabled();
  });

  it("speaks 繁 and keeps the figures free of bare numbers", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(screen.getByRole("radio", { name: "繁體中文" }));
    expect(screen.getByRole("heading", { name: "為你推介" })).toBeInTheDocument();
    expect(document.querySelector('main [data-idea="jacket"] .home-try__title')?.textContent).toBe("牛仔褸");
    const section = document.querySelector("[data-tour='ideas']")!;
    expect(bareFigures(section)).toEqual([]);
    expect(numsWithoutChip(section)).toEqual([]);
  });
});

describe("Demo scenarios (for judges)", () => {
  it("is open on the booth Mac (a loopback address), and every scenario is in it", async () => {
    await bootApp("#/budget");
    expect(disclosure().open).toBe(true);
    expect(within(disclosure()).getAllByRole("button").filter((b) => b.hasAttribute("data-scenario"))).toHaveLength(13);
    expect(within(disclosure()).getByRole("button", { name: /Start the demo over/ })).toBeInTheDocument();
    expect(screen.getByText("Demo scenarios (for judges)", { selector: ".home-demo__title" })).toBeInTheDocument();
  });

  it("is closed for a shopper who closed it, and stays closed for that browser", async () => {
    await bootApp("#/budget", { [DEMO_OPEN_KEY]: "0" });
    expect(disclosure().open).toBe(false);
    // The cards are still in the page for anything that needs them, just folded away.
    expect(disclosure().querySelectorAll("[data-scenario]")).toHaveLength(13);
  });

  it("remembers a choice made with the toggle", async () => {
    const h = await bootApp("#/budget", { [DEMO_OPEN_KEY]: "0" });
    const summary = disclosure().querySelector("summary")!;
    await h.user.click(summary);
    await waitFor(() => expect(window.localStorage.getItem(DEMO_OPEN_KEY)).toBe("1"));
    expect(disclosure().open).toBe(true);
    await h.user.click(summary);
    await waitFor(() => expect(window.localStorage.getItem(DEMO_OPEN_KEY)).toBe("0"));
  });

  it("does not turn its own default into a remembered choice", async () => {
    await bootApp("#/budget");
    fireEvent(disclosure(), new Event("toggle"));
    expect(window.localStorage.getItem(DEMO_OPEN_KEY)).toBeNull();
  });

  it("opens for ?booth=1 whatever was chosen before, and for presenter mode", async () => {
    window.history.replaceState(null, "", "/?booth=1");
    await bootApp("#/budget", { [DEMO_OPEN_KEY]: "0" });
    expect(disclosure().open).toBe(true);
  });

  it("opens in presenter mode whatever was chosen before", async () => {
    await bootApp("#/budget", { [DEMO_OPEN_KEY]: "0", [PRESENTER_KEY]: "1" });
    expect(disclosure().open).toBe(true);
  });

  it("still runs a scenario from inside it, and Wally shows the result", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(document.querySelector<HTMLElement>('[data-demo-disclosure] [data-scenario="flagged"]')!);
    expect(window.location.hash).toBe("#/wally");
    await go("#/budget");
    const first = within(await screen.findByRole("list", { name: "Recent" })).getAllByRole("link")[0]!;
    expect(first).toHaveTextContent("Stopped before paying");
  });

  it("keeps the 繁 title and the scenario cards' own words", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(screen.getByRole("radio", { name: "繁體中文" }));
    expect(document.querySelector(".home-demo__title")).toHaveTextContent("示範情境（供評審使用）");
    expect(disclosure().querySelector('[data-scenario="normal"]')).toHaveTextContent("買一件純棉T恤");
  });
});

describe("the demo scenarios' name", () => {
  it("says for judges on the booth's pages and plain Demo scenarios everywhere else", async () => {
    const { DemoScenarios } = await import("../src/screens/home/DemoScenarios");
    const { rerender } = render(<DemoScenarios lead="Each one runs the real rules." booth><span /></DemoScenarios>);
    expect(screen.getByText("Demo scenarios (for judges)", { selector: ".home-demo__title" })).toBeInTheDocument();
    rerender(<DemoScenarios lead="Each one runs the real rules." booth={false}><span /></DemoScenarios>);
    expect(screen.getByText("Demo scenarios", { selector: ".home-demo__title" })).toBeInTheDocument();
    expect(screen.queryByText(/judges/)).toBeNull();
    expect(document.querySelector(".home-demo .sr-only")).toHaveTextContent("Demo scenarios");
  });
});

describe("a ?booth=1 link is the crew's, not a first run", () => {
  it("does not start the first run even with no flag in storage", async () => {
    const { openFirstRun } = await import("./helpers/firstRun");
    window.history.replaceState(null, "", "/?booth=1");
    await openFirstRun({ sealed: true });
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Hi, I'm Wally." })).toBeNull();
  });
});
