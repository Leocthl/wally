// The Ask sheet hands the typed words to Wally's screen before the request goes out, so the working screen can show
// what was asked. The run that follows claims them once (screens/run/askEcho.ts); nothing is stored or sent.
import { FakeClock } from "@wally/core/testing";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { MockApiClient } from "../src/api/MockApiClient";
import type { ApiInfo, AskRequest, RunSummary } from "../src/api/types";
import { claimAsk } from "../src/screens/run/askEcho";

vi.setConfig({ testTimeout: 30_000 });

/** A booth that takes typed asks and never answers, so no run starts and nothing else claims the words. */
class SilentAsk extends MockApiClient {
  readonly asked: AskRequest[] = [];

  constructor() {
    super({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
  }

  override async info(): Promise<ApiInfo> {
    const base = await super.info();
    return { ...base, kind: "http", features: { ask: true, alternatives: false, compile: "rules", family: false } };
  }

  ask(req: AskRequest): Promise<RunSummary> {
    this.asked.push(req);
    return new Promise<RunSummary>(() => undefined);
  }
}

/** A booth that takes typed asks and refuses them (the planner is down), so a run never starts. */
class RefusedAsk extends SilentAsk {
  override ask(req: AskRequest): Promise<RunSummary> {
    this.asked.push(req);
    return Promise.reject(new Error("the planner is down"));
  }
}

async function openBudget(client: SilentAsk) {
  window.localStorage.clear();
  window.localStorage.setItem("wally:lang", "en");
  window.location.hash = "#/budget";
  const user = userEvent.setup();
  render(<App api={client} />);
  await screen.findByRole("meter");
  return user;
}

describe("a refused ask leaves no words behind", () => {
  it("typed in the Ask sheet: the next run does not wear the question that never started one", async () => {
    const client = new RefusedAsk();
    const user = await openBudget(client);
    await user.click(screen.getByRole("button", { name: /^Ask$/ }));
    const sheet = await screen.findByRole("dialog");
    await user.type(within(sheet).getByRole("textbox", { name: /Tell Wally what you need/ }), "a plain cotton tee");
    await user.click(within(sheet).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(client.asked).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("the planner is down"));
    expect(claimAsk("run_refused_sheet")).toBeUndefined();
    window.localStorage.clear();
  });

  it("from an idea on Home: the same", async () => {
    const client = new RefusedAsk();
    const user = await openBudget(client);
    await user.click(document.querySelector<HTMLElement>('main [data-idea="jacket"]')!);
    await waitFor(() => expect(client.asked).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("the planner is down"));
    expect(claimAsk("run_refused_idea")).toBeUndefined();
    window.localStorage.clear();
  });
});

describe("the Ask sheet notes the question for Wally's screen", () => {
  it("the words typed in the field are what the next run claims", async () => {
    window.localStorage.clear();
    window.localStorage.setItem("wally:lang", "en");
    window.location.hash = "#/budget";
    const client = new SilentAsk();
    const user = userEvent.setup();
    render(<App api={client} />);
    await screen.findByRole("meter");
    await user.click(screen.getByRole("button", { name: /^Ask$/ }));
    const sheet = await screen.findByRole("dialog");
    await user.type(within(sheet).getByRole("textbox", { name: /Tell Wally what you need/ }), "  a plain cotton tee  ");
    await user.click(within(sheet).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(client.asked).toEqual([{ requestText: "a plain cotton tee", locale: "en" }]));
    expect(claimAsk("run_probe")).toBe("a plain cotton tee");
    window.localStorage.clear();
  });
});
