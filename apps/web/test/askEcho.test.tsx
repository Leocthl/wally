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
