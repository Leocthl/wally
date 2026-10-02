// The Ask sheet's typed request (api.ask), shown only when the booth says it can take one (info.features.ask), and the
// honest hint on a device that only knows the sample asks.
import { FakeClock } from "@laisee/core/testing";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { MockApiClient } from "../src/api/MockApiClient";
import type { ApiFeatures, ApiInfo, AskRequest, RunSummary } from "../src/api/types";

vi.setConfig({ testTimeout: 30_000 });

class AskClient extends MockApiClient {
  readonly asked: AskRequest[] = [];
  readonly #kind: ApiInfo["kind"];
  readonly #features: Partial<ApiFeatures>;

  constructor(kind: ApiInfo["kind"], features: Partial<ApiFeatures>) {
    super({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
    this.#kind = kind;
    this.#features = features;
  }

  override async info(): Promise<ApiInfo> {
    const base = await super.info();
    return { ...base, kind: this.#kind, features: { ask: true, alternatives: false, compile: "rules", family: false, ...this.#features } };
  }

  /** Stands in for the planner: whatever is asked, Wally buys the tee. */
  ask(req: AskRequest): Promise<RunSummary> {
    this.asked.push(req);
    return this.runScenario("normal");
  }
}

async function openSheet(client: MockApiClient, locale: "en" | "zh-HK" = "en") {
  window.localStorage.clear();
  window.localStorage.setItem("wally:lang", locale);
  window.location.hash = "#/budget";
  const user = userEvent.setup();
  render(<App api={client} /> as ReactElement);
  await screen.findByRole("meter");
  await user.click(screen.getByRole("button", { name: locale === "en" ? /^Ask$/ : /^問 Wally$/ }));
  const sheet = await screen.findByRole("dialog");
  return { user, sheet };
}

describe("Ask sheet: typed request", () => {
  it("shows the field when the booth can ask, sends the words with the screen language, and shows Wally's result", async () => {
    const client = new AskClient("http", {});
    const { user, sheet } = await openSheet(client);
    const field = within(sheet).getByRole("textbox", { name: /Tell Wally what you need/ });
    expect(field).toHaveAttribute("placeholder", "A plain white tee under HK$150");
    expect(within(sheet).queryByText("Live asks need the booth server.")).toBeNull();
    const send = within(sheet).getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    await user.type(field, "a plain cotton tee");
    await user.click(send);
    await waitFor(() => expect(client.asked).toEqual([{ requestText: "a plain cotton tee", locale: "en" }]));
    await waitFor(() => expect(window.location.hash).toBe("#/wally"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByRole("heading", { name: "Paid with a one-off card" })).toBeInTheDocument();
  });

  it("sends the language the screen is in, and shows the Chinese example", async () => {
    const client = new AskClient("http", {});
    const { user, sheet } = await openSheet(client, "zh-HK");
    const field = within(sheet).getByRole("textbox", { name: /話俾 Wally 知你想買乜/ });
    expect(field).toHaveAttribute("placeholder", "我想買件白色T恤，預算一百五十蚊");
    await user.type(field, "我想買件白色T恤");
    await user.click(within(sheet).getByRole("button", { name: "傳送" }));
    await waitFor(() => expect(client.asked).toEqual([{ requestText: "我想買件白色T恤", locale: "zh-HK" }]));
    window.localStorage.clear();
  });

  it("shows nothing extra when the booth cannot take a typed ask", async () => {
    const { sheet } = await openSheet(new AskClient("http", { ask: false }));
    expect(within(sheet).queryByRole("textbox", { name: /Tell Wally what you need/ })).toBeNull();
    expect(within(sheet).queryByText("Live asks need the booth server.")).toBeNull();
    expect(within(sheet).getByRole("textbox", { name: /Product description/ })).toBeInTheDocument();
  });

  it("shows nothing extra on the offline mock, which has no ask at all", async () => {
    const { sheet } = await openSheet(new MockApiClient({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 }));
    expect(within(sheet).queryByRole("textbox", { name: /Tell Wally what you need/ })).toBeNull();
    expect(within(sheet).queryByText("Live asks need the booth server.")).toBeNull();
  });

  it("says plainly that live asks need the booth server when the device knows the sample asks only", async () => {
    const { sheet } = await openSheet(new AskClient("local", {}));
    expect(within(sheet).getByRole("textbox", { name: /Tell Wally what you need/ })).toBeInTheDocument();
    expect(within(sheet).getByText("Live asks need the booth server.")).toBeInTheDocument();
  });

  it("says it too when the device has no typed ask at all", async () => {
    const { sheet } = await openSheet(new AskClient("local", { ask: false }));
    expect(within(sheet).queryByRole("textbox", { name: /Tell Wally what you need/ })).toBeNull();
    expect(within(sheet).getByText("Live asks need the booth server.")).toBeInTheDocument();
  });

  it("does not show the field when the client has no ask method, even if the booth says it can", async () => {
    const plain = new MockApiClient({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
    vi.spyOn(plain, "info").mockResolvedValue({ ...(await plain.info()), features: { ask: true, alternatives: false, compile: "rules", family: false } });
    const { sheet } = await openSheet(plain);
    expect(within(sheet).queryByRole("textbox", { name: /Tell Wally what you need/ })).toBeNull();
  });
});
