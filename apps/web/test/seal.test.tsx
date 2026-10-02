// Seal flow (lane b-shell): Meet Wally, Describe your budget, Check and seal, Sealed. Rows validate with words; example
// chips fill sentence and rows; Top up and Change the rules start prefilled; a failed seal stays put; the model slot
// (api.compileRules, or suggestRules from <App>) fills rows, says what it read and never seals by itself.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { MockApiClient } from "../src/api/MockApiClient";
import type { CompileResult, CompiledRules } from "../src/api/types";
import { bootApp, go } from "./helpers/app";
import { bareFigures, numsWithoutChip } from "./helpers/figures";
import { FirstSealFails, SealAlwaysFails } from "./helpers/shellClients";

vi.setConfig({ testTimeout: 30_000 });

const amount = () => screen.getByRole("textbox", { name: /^Amount/ });
const next = () => screen.getByRole("button", { name: /^Next/ });

function firstRun(api: MockApiClient = new FirstSealFails(), extra: Partial<Parameters<typeof App>[0]> = {}) {
  window.localStorage.clear();
  window.location.hash = "#/budget";
  const user = userEvent.setup();
  render(<App api={api} {...extra} /> as ReactElement);
  return { api, user };
}

describe("first run", () => {
  it("walks Meet Wally, Describe, Check and seal, then Sealed, and lands on the new budget", async () => {
    const { api, user } = firstRun();
    await user.click(await screen.findByRole("button", { name: /^Start/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Describe your budget" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Your budget in a sentence/ })).toHaveValue("HK$800 this month for clothes, verified sellers only");
    expect(amount()).toHaveValue("800");
    expect(screen.getByRole("button", { name: "Clothes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("switch", { name: "Verified sellers only" })).toBeChecked();
    await user.click(next());
    expect(screen.getByRole("heading", { level: 1, name: "Check and seal" })).toBeInTheDocument();
    const summary = document.querySelector(".seal-summary")!;
    expect(summary).toHaveTextContent("HK$800");
    expect(summary).toHaveTextContent("Clothes only");
    expect(bareFigures(document.querySelector("main")!)).toEqual([]);
    expect(numsWithoutChip(document.querySelector("main")!)).toEqual([]);
    await user.click(screen.getByRole("button", { name: /Seal budget/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Your budget is sealed" })).toBeInTheDocument();
    expect(document.querySelector('.seal-lock[data-locked="true"]')).not.toBeNull();
    const snap = await api.snapshot();
    expect(snap.mandate?.rules.budget.amount_minor).toBe(80000);
    expect(snap.mandate?.intent_text).toBe("HK$800 this month for clothes, verified sellers only");
    await user.click(screen.getByRole("link", { name: /Go to your budget/ }));
    await waitFor(() => expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED"));
  });

  it("says what is wrong in words, marks the field, and moves focus to the first problem", async () => {
    const { user } = firstRun();
    await user.click(await screen.findByRole("button", { name: /^Start/ }));
    await user.clear(amount());
    await user.click(screen.getByRole("button", { name: "Clothes" }));
    await user.click(next());
    expect(amount()).toHaveAttribute("aria-invalid", "true");
    expect(amount()).toHaveAccessibleDescription(/Enter an amount above zero\./);
    expect(amount()).toHaveFocus();
    expect(screen.getByText("Pick at least one thing Wally can buy.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Describe your budget" })).toBeInTheDocument();
    await user.type(amount(), "12x");
    expect(screen.getByText("Use digits only, with up to two decimals.")).toBeInTheDocument();
    await user.clear(amount());
    await user.type(amount(), "650");
    await user.click(screen.getByRole("button", { name: "Shoes" }));
    await user.click(next());
    expect(screen.getByRole("heading", { level: 1, name: "Check and seal" })).toBeInTheDocument();
    expect(document.querySelector(".seal-summary")).toHaveTextContent("HK$650");
  });

  it("an example chip fills the sentence and the rows, extra rules included", async () => {
    const { user } = firstRun();
    await user.click(await screen.findByRole("button", { name: /^Start/ }));
    await user.click(screen.getByRole("button", { name: "Shoes for two weeks" }));
    expect(screen.getByRole("textbox", { name: /Your budget in a sentence/ })).toHaveValue("HK$500 for shoes over the next 14 days, verified sellers only; ask me above HK$300");
    expect(amount()).toHaveValue("500");
    expect(screen.getByRole("button", { name: "Shoes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Clothes" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("textbox", { name: "Ask me above" })).toHaveValue("300");
    await user.click(screen.getByRole("button", { name: "Remove this rule" }));
    expect(screen.queryByRole("textbox", { name: "Ask me above" })).toBeNull();
  });

  it("stays on Check and seal when sealing fails, and says nothing was charged", async () => {
    const { user } = firstRun(new SealAlwaysFails());
    await user.click(await screen.findByRole("button", { name: /^Start/ }));
    await user.click(next());
    await user.click(screen.getByRole("button", { name: /Seal budget/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("That didn't go through. Nothing was charged."));
    expect(screen.getByRole("heading", { level: 1, name: "Check and seal" })).toBeInTheDocument();
    expect(screen.queryByText("Your budget is sealed")).toBeNull();
  });
});

describe("Top up and Change the rules", () => {
  it("start at step two prefilled from the signed rules, and seal a new budget", async () => {
    const h = await bootApp("#/seal?mode=edit");
    expect(screen.getByRole("heading", { level: 1, name: "Change your rules" })).toBeInTheDocument();
    expect(amount()).toHaveValue("800");
    await h.user.clear(amount());
    await h.user.type(amount(), "1200");
    await h.user.click(next());
    expect(screen.getByText("Sealing starts a new budget and new receipts.")).toBeInTheDocument();
    await h.user.click(screen.getByRole("button", { name: /Seal budget/ }));
    await screen.findByRole("heading", { level: 1, name: "Your budget is sealed" });
    expect((await h.api.snapshot()).packet?.budget_minor).toBe(120000);
    await go("#/budget");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "HK$1,200 left of HK$1,200, SIMULATED");
  });

  it("goes back to Budget from step two", async () => {
    const h = await bootApp("#/seal?mode=topup");
    await h.user.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(window.location.hash).toBe("#/budget"));
  });
});

const SAMPLE = "HK$800 this month for clothes, verified sellers only";

function compiled(over: Partial<CompileResult> = {}): CompileResult {
  const rules: CompiledRules = { budget: { amount_minor: 30000, currency: "HKD" }, categories: ["groceries"], merchants: { allow: null, deny: [] }, seller_check: { require_capture: false } };
  return { source: "model", rules, validUntil: "2099-12-30T15:59:59Z", labels: [{ kind: "budget", rule: "R3", en: "HK$300 budget", zhHK: "預算 HK$300" }], notes: ["No end date was given, so the budget lasts to the end of the month."], clamped: [], confirmRequired: true, ...over };
}

describe("the sentence reader (api.compileRules, or suggestRules from <App>)", () => {
  it("fills the rows from the reader's rules, says what it read, and never seals by itself", async () => {
    const suggestRules = vi.fn(async () => compiled({ clamped: ["A weekly limit is not a rule Wally can enforce."] }));
    const api = new FirstSealFails();
    const seal = vi.spyOn(api, "seal");
    const { user } = firstRun(api, { suggestRules });
    await user.click(await screen.findByRole("button", { name: /^Start/ }));
    await user.click(screen.getByRole("button", { name: /Read my sentence/ }));
    await waitFor(() => expect(amount()).toHaveValue("300"));
    expect(suggestRules).toHaveBeenCalledWith(SAMPLE, "en");
    expect(screen.getByRole("button", { name: "Groceries" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("switch", { name: "Verified sellers only" })).not.toBeChecked();
    const read = screen.getByRole("status", { name: "What Wally understood" });
    expect(read).toHaveTextContent("HK$300 budget");
    expect(read).toHaveTextContent("No end date was given");
    expect(within(read).getByText("Left out of the suggestion")).toBeInTheDocument();
    expect(read).toHaveTextContent("A weekly limit is not a rule Wally can enforce.");
    expect(read).toHaveTextContent("Read by Wally's on-device model.");
    expect(read).toHaveTextContent("Nothing is sealed until you say so.");
    expect(seal).toHaveBeenCalledTimes(1); // only the preset seal on load, which failed
  });

  it("asks the booth's own reader by default, with the screen language, and keeps every row editable", async () => {
    const api = new FirstSealFails();
    const compile = vi.spyOn(api, "compileRules");
    const seal = vi.spyOn(api, "seal");
    const { user } = firstRun(api);
    await user.click(await screen.findByRole("button", { name: /^Start/ }));
    await user.click(screen.getByRole("button", { name: /Read my sentence/ }));
    const read = await screen.findByRole("status", { name: "What Wally understood" });
    expect(compile).toHaveBeenCalledWith({ text: SAMPLE, locale: "en" });
    expect(read).toHaveAttribute("data-source", "rules");
    expect(read).toHaveTextContent("Read by fixed rules.");
    expect(amount()).toHaveValue("800");
    await user.clear(amount());
    await user.type(amount(), "650");
    expect(amount()).toHaveValue("650");
    await user.click(next());
    expect(screen.getByRole("heading", { level: 1, name: "Check and seal" })).toBeInTheDocument();
    expect(seal).toHaveBeenCalledTimes(1);
  });

  it("forgets what it read when the sentence changes", async () => {
    const { user } = firstRun();
    await user.click(await screen.findByRole("button", { name: /^Start/ }));
    await user.click(screen.getByRole("button", { name: /Read my sentence/ }));
    await screen.findByRole("status", { name: "What Wally understood" });
    await user.type(screen.getByRole("textbox", { name: /Your budget in a sentence/ }), " today");
    expect(screen.queryByRole("status", { name: "What Wally understood" })).toBeNull();
  });

  it("has no Read my sentence button when the client cannot read a sentence; typing still fills the rows", async () => {
    const api = new FirstSealFails();
    (api as { compileRules?: unknown }).compileRules = undefined;
    const { user } = firstRun(api);
    await user.click(await screen.findByRole("button", { name: /^Start/ }));
    expect(screen.queryByRole("button", { name: /Read my sentence/ })).toBeNull();
    expect(amount()).toHaveValue("800");
  });

  it("falls back to the typed sentence's rows, with a plain note, when the reader fails or cannot read it", async () => {
    const api = new FirstSealFails();
    vi.spyOn(api, "compileRules").mockRejectedValueOnce(new Error("the booth could not be reached"));
    const { user } = firstRun(api);
    await user.click(await screen.findByRole("button", { name: /^Start/ }));
    await user.click(screen.getByRole("button", { name: /Read my sentence/ }));
    expect(await screen.findByText("Wally couldn't read that. Set the rules below.")).toBeInTheDocument();
    expect(amount()).toHaveValue("800");
    expect(screen.queryByRole("status", { name: "What Wally understood" })).toBeNull();
  });

  it("says so when suggestRules returns nothing", async () => {
    const { user } = firstRun(new FirstSealFails(), { suggestRules: async () => null });
    await user.click(await screen.findByRole("button", { name: /^Start/ }));
    await user.click(screen.getByRole("button", { name: /Read my sentence/ }));
    expect(await screen.findByText("Wally couldn't read that. Set the rules below.")).toBeInTheDocument();
    expect(amount()).toHaveValue("800");
  });

  it("sends the Chinese sentence with locale zh-HK", async () => {
    window.localStorage.setItem("wally:lang", "zh-HK");
    window.location.hash = "#/budget";
    const api = new FirstSealFails();
    const compile = vi.spyOn(api, "compileRules");
    const user = userEvent.setup();
    render(<App api={api} /> as ReactElement);
    await user.click(await screen.findByRole("button", { name: /^開始/ }));
    await user.click(screen.getByRole("button", { name: /幫我讀句子/ }));
    await waitFor(() => expect(compile).toHaveBeenCalledWith({ text: "今個月 HK$800 買衫，只限認證賣家", locale: "zh-HK" }));
    window.localStorage.clear();
  });
});

describe("in 繁", () => {
  it("shows the flow in Chinese with the example sentence in Chinese and the rules from the English example", async () => {
    window.localStorage.setItem("wally:lang", "zh-HK");
    window.location.hash = "#/budget";
    const user = userEvent.setup();
    render(<App api={new FirstSealFails()} /> as ReactElement);
    await user.click(await screen.findByRole("button", { name: /^開始/ }));
    expect(screen.getByRole("heading", { level: 1, name: "描述你的預算" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /用一句話講你的預算/ })).toHaveValue("今個月 HK$800 買衫，只限認證賣家");
    expect(screen.getByRole("textbox", { name: /^金額/ })).toHaveValue("800");
    const cats = screen.getByRole("group", { name: "Wally 可以買甚麼" });
    expect(within(cats).getByRole("button", { name: /衣物/ })).toHaveAttribute("aria-pressed", "true");
    window.localStorage.clear();
  });
});
