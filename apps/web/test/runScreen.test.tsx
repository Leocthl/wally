// The Wally screen (#/wally) mounted alone and driven by recorded TraceEvent streams: idle, Wally shopping, approved
// (card, budget, DM2 card story, Pay now), stopped (plain reason, rule chip, actions), needs your OK (approve, no
// thanks, expiry), no clear pick, checker offline, the "Why?" sheet, EN and zh-HK, roles and focus.
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Decision, TraceEvent } from "../src/api/types";
import { ASK_EVENT } from "../src/screens/run/RunScreen";
import { coreInjectionDecision, undecidedRun } from "./runTraces";
import { mountRun, type Mounted } from "./runMount";

vi.setConfig({ testTimeout: 20_000 });

/** No rule id (R3, R10...), probability or raw JSON on the main surface; those live in the Why sheet. */
function expectPlainSurface(m: Mounted): void {
  const text = m.root().textContent ?? "";
  expect(text).not.toMatch(/\bR\d{1,2}\b/);
  expect(text).not.toMatch(/[{}[\]"]/);
  expect(text).not.toMatch(/\b0\.\d{2}\b/);
}

async function lastDecision(m: Mounted): Promise<Decision> {
  const entries = (await m.mock.getLog()).entries;
  const d = entries.filter((e) => e.kind === "DECISION").at(-1)?.payload as Decision | undefined;
  if (!d) throw new Error("no decision logged");
  return d;
}

async function openEscalation(m: Mounted): Promise<string> {
  const id = (await m.mock.snapshot()).escalations.at(-1)?.decisionId;
  if (!id) throw new Error("no escalation");
  return id;
}

describe("idle", () => {
  it("shows Wally ready with one invitation, and Ask opens the shell's Ask sheet", async () => {
    const onAsk = vi.fn();
    const m = await mountRun({ onAsk });
    expect(screen.getByRole("heading", { name: "Ready when you are" })).toBeInTheDocument();
    await m.user.click(screen.getByRole("button", { name: "Ask Wally" }));
    expect(onAsk).toHaveBeenCalledOnce();
  });

  it("without an onAsk prop, Ask dispatches the wally:ask window event", async () => {
    const heard = vi.fn();
    window.addEventListener(ASK_EVENT, heard);
    const m = await mountRun();
    await m.user.click(screen.getByRole("button", { name: "Ask Wally" }));
    window.removeEventListener(ASK_EVENT, heard);
    expect(heard).toHaveBeenCalledOnce();
  });
});

describe("Wally is shopping", () => {
  it("shows the four steps with a polite live summary, then moves focus to the result heading", async () => {
    const m = await mountRun();
    const at = "2026-10-03T02:05:00Z";
    const working: TraceEvent[] = [
      { type: "run.started", runId: "run_live", scenario: "custom", at },
      { type: "stage", runId: "run_live", stage: "planner", status: "running", at },
    ];
    await m.inject(working);
    const steps = screen.getByRole("list", { name: "What Wally is doing" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(4);
    expect(within(steps).getByText("Wally picks")).toBeInTheDocument();
    expect(within(steps).getByText("Wally reads the listing")).toBeInTheDocument();
    expect(within(steps).getByText("Rules check")).toBeInTheDocument();
    expect(within(steps).getByText("One-off card")).toBeInTheDocument();
    const live = m.root().querySelector('[aria-live="polite"]');
    expect(live).toHaveTextContent("Step 1 of 4: Wally picks");
    expect(m.root().querySelector('[aria-busy="true"]')).not.toBeNull();
    await m.inject(undecidedRun("run_live", "ERROR").slice(2));
    const heading = await screen.findByRole("heading", { name: "Something went wrong, so nothing was bought" });
    await waitFor(() => expect(heading).toHaveFocus());
  });
});

describe("approved", () => {
  it("normal purchase: card made and paid, the exact charge, the budget now, no ids on the surface", async () => {
    const m = await mountRun();
    await m.run("normal");
    const status = screen.getByRole("status", { name: "" });
    expect(status).toHaveTextContent("Paid with a one-off card");
    expect(status).toHaveTextContent("HK$259");
    const card = screen.getByRole("article", { name: "One-off card" });
    expect(card).toHaveTextContent("Works once, for HK$259 only");
    expect(card).toHaveTextContent("Card ending 0001");
    expect(card).toHaveTextContent("SIMULATED");
    expect(screen.getByRole("meter", { name: "Budget left" })).toHaveAttribute("aria-valuetext", "HK$541 left of HK$800");
    expect(screen.getByText("Charged the exact HK$259.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay now" })).toBeNull();
    expect(screen.getByText("Fixed rules decided this, not the AI.")).toBeInTheDocument();
    expectPlainSurface(m);
  });

  it("mint only: Pay now pays the card once, then the story shows the charge", async () => {
    const m = await mountRun();
    await m.run("mint");
    expect(screen.getByRole("heading", { name: "Wally made a one-off card" })).toBeInTheDocument();
    await m.user.click(screen.getByRole("button", { name: "Pay now" }));
    await screen.findByText("Charged the exact HK$259.");
    expect(screen.getByRole("heading", { name: "Paid with a one-off card" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay now" })).toBeNull();
  });

  it("DM2 beats: charged more is declined with the limit held, the exact charge, then a replay is declined", async () => {
    const m = await mountRun();
    for (const id of ["mint", "overshoot", "pay", "replay"] as const) await m.run(id);
    const story = screen.getByRole("region", { name: "At checkout" });
    const rows = within(story).getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toEqual([
      "The shop asked for HK$268. Declined, the HK$259 limit held.",
      "Charged the exact HK$259.",
      "Someone tried the card again. Declined, it works once.",
    ]);
    expectPlainSurface(m);
  });

  it("wrong shop and timeout beats read in plain words", async () => {
    const m = await mountRun();
    await m.run("mint");
    await m.run("wrong_merchant");
    expect(screen.getByText("A different shop tried the card. Declined.")).toBeInTheDocument();
    const t = await mountRun();
    await t.run("mint");
    await t.run("timeout");
    expect(screen.getByText("The shop timed out. Wally retried once and HK$259 was charged once.")).toBeInTheDocument();
  });
});

describe("stopped before paying", () => {
  it("flagged seller: an alert with the plain reason and a named rule, no card, and no budget actions", async () => {
    const m = await mountRun();
    await m.run("flagged");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Stopped before paying");
    expect(alert).toHaveTextContent("This seller is flagged as a possible scam.");
    expect(alert).toHaveTextContent("Seller check");
    expect(screen.getByText("No card was made. Nothing can be charged.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Top up budget" })).toBeNull();
    expect(screen.queryByRole("button", { name: "See cheaper options" })).toBeNull();
    expect(screen.getByRole("button", { name: "Ask Wally" })).toBeInTheDocument();
    expectPlainSurface(m);
  });

  it("over budget: the engine's figures in plain words, and Top up budget opens Seal", async () => {
    const m = await mountRun();
    await m.run("normal");
    await m.run("overflow");
    expect(screen.getByRole("alert")).toHaveTextContent("It costs HK$550 with shipping, but only HK$541 is left in your budget.");
    expect(screen.getByRole("alert")).toHaveTextContent("Budget rule");
    expect(screen.queryByRole("button", { name: "See cheaper options" })).toBeNull();
    await m.user.click(screen.getByRole("button", { name: "Top up budget" }));
    expect(window.location.hash).toBe("#/seal");
  });

  it("See cheaper options appears only when the client offers suggestAlternatives", async () => {
    const suggestAlternatives = vi.fn(async () => undefined);
    const m = await mountRun({ extend: { suggestAlternatives } });
    await m.run("normal");
    await m.run("overflow");
    await m.user.click(screen.getByRole("button", { name: "See cheaper options" }));
    expect(suggestAlternatives).toHaveBeenCalledWith({ decisionId: (await lastDecision(m)).id });
  });

  it("injected listing: the plain injection reason, never a probability", async () => {
    const m = await mountRun();
    await m.run("injected");
    expect(screen.getByRole("alert")).toHaveTextContent("The listing tried to give Wally orders.");
    expectPlainSurface(m);
  });

  it("price drift: the card was cancelled and the story says why", async () => {
    const m = await mountRun();
    await m.run("mint");
    await m.run("drift");
    expect(screen.getByRole("alert")).toHaveTextContent("The price changed at checkout, so Wally cancelled the card.");
    expect(screen.getByText("The card was cancelled. Nothing more can be charged.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "At checkout" })).toBeNull();
  });

  it("renders in 繁 with lang=zh-HK", async () => {
    const m = await mountRun({ locale: "zh-HK" });
    await m.run("flagged");
    expect(m.root()).toHaveAttribute("lang", "zh-HK");
    expect(screen.getByRole("alert")).toHaveTextContent("付款前已攔截");
    expect(screen.getByRole("alert")).toHaveTextContent("呢個賣家被標記為可能詐騙。");
    expect(screen.getByRole("alert")).toHaveTextContent("賣家檢查");
    expectPlainSurface(m);
  });
});

describe("needs your OK", () => {
  it("shows the reason, the amount and a countdown; Approve continues to the approval", async () => {
    const m = await mountRun();
    await m.run("unverified");
    expect(screen.getByRole("heading", { name: "Needs your OK" })).toBeInTheDocument();
    expect(screen.getByText("Wally couldn't check this seller recently.")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("60 s left");
    expect(screen.getByText("Your answer can't override a fixed rule.")).toBeInTheDocument();
    expect(m.root().querySelector('[aria-live="polite"]')).toHaveTextContent("You have 60 seconds to answer.");
    const spy = vi.spyOn(m.mock, "answerEscalation");
    await act(async () => {
      await m.user.click(screen.getByRole("button", { name: "Approve" }));
    });
    expect(spy).toHaveBeenCalledWith({ decisionId: expect.stringMatching(/^dec_/), choice: "APPROVE" });
    await screen.findByText("You said yes, so Wally went ahead.");
    expect(screen.getByRole("article", { name: "One-off card" })).toBeInTheDocument();
    expectPlainSurface(m);
  });

  it("No thanks: stopped, because you said no", async () => {
    const m = await mountRun();
    await m.run("unverified");
    await act(async () => {
      await m.user.click(screen.getByRole("button", { name: "No thanks" }));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("You said no, so Wally stopped it.");
  });

  it("expiry: the countdown ends and nobody answered in time", async () => {
    const m = await mountRun();
    await m.run("unverified");
    m.clock.advance(61_000);
    await act(async () => {
      await m.mock.sweepEscalations();
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Nobody answered in time, so Wally stopped it.");
    expect(m.mock).toBeDefined();
    expect(await openEscalation(m)).toMatch(/^dec_/);
  });

  it("yes, but a fixed rule still stops it: the screen says your answer could not override the rule", async () => {
    const m = await mountRun();
    await m.run("unverified");
    const asked = await openEscalation(m);
    for (const id of ["normal", "normal", "small"] as const) await m.run(id);
    await act(async () => {
      await m.mock.answerEscalation({ decisionId: asked, choice: "APPROVE" });
      window.location.hash = `#/wally?d=${asked}`;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You said yes, but a fixed rule still stops this.");
    expect(alert).toHaveTextContent("It costs HK$259 with shipping, but only HK$162 is left in your budget.");
  });

  it("checker offline: asks you first, in plain words (R10.unavailable)", async () => {
    const m = await mountRun();
    await act(async () => {
      await m.mock.propose({ listingText: "A plain cotton tee. ".repeat(260) });
    });
    expect(screen.getByText("Wally's checker is offline, so it asked you first.")).toBeInTheDocument();
    expectPlainSurface(m);
  });
});

describe("runs that pick nothing", () => {
  it("no proposal: a calm message and the Ask shortcut", async () => {
    const m = await mountRun();
    await m.inject(undecidedRun("run_np", "INFO"));
    expect(screen.getByRole("heading", { name: "Wally couldn't pick a clear item" })).toBeInTheDocument();
    expect(screen.getByText("Try describing it differently.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask Wally" })).toBeInTheDocument();
  });
});

describe("the Why sheet", () => {
  it("lists the checks in plain words, and only its nerd details carry rule ids and the engine's sentence", async () => {
    const m = await mountRun();
    await m.run("normal");
    await m.run("overflow");
    await m.user.click(screen.getByRole("button", { name: "Why?" }));
    const sheet = await screen.findByRole("dialog", { name: "Why Wally stopped" });
    const checks = within(sheet).getByRole("list", { name: "The checks" });
    const names = within(checks).getAllByRole("listitem").map((li) => li.querySelector(".w-row__title")?.textContent);
    expect(names).toEqual(["Your budget", "Your rules", "Seller", "Wally's read of the listing", "Card limit"]);
    expect(within(checks).getByText("HK$550 is over the HK$541 left")).toBeInTheDocument();
    const nerds = sheet.querySelector("details") as HTMLDetailsElement;
    expect(nerds).not.toHaveAttribute("open");
    await m.user.click(within(sheet).getByText("Details for nerds"));
    expect(nerds.open).toBe(true);
    expect(nerds).toHaveTextContent("Stopped by R3. Total HK$550 is over the HK$541 left.");
    expect(within(nerds).getByRole("link", { name: /See the receipt/ })).toHaveAttribute("href", `#/receipts?d=${(await lastDecision(m)).id}`);
    expectPlainSurface(m);
  });

  it("shows the engine's own injection sentence with its figure, never '?' (core key p_injection_risk)", async () => {
    const m = await mountRun();
    await m.run("normal");
    const core = coreInjectionDecision(await lastDecision(m));
    const at = "2026-10-03T03:00:00Z";
    await m.inject([
      { type: "run.started", runId: "run_core", scenario: "custom", at },
      { type: "decision", runId: "run_core", decision: { ...core, id: "dec_core0001" } },
      { type: "run.finished", runId: "run_core", outcome: "DENY", at },
    ]);
    expect(screen.getByRole("alert")).toHaveTextContent("The listing tried to give Wally orders.");
    await m.user.click(screen.getByRole("button", { name: "Why?" }));
    const sheet = await screen.findByRole("dialog");
    await m.user.click(within(sheet).getByText("Details for nerds"));
    const quote = sheet.querySelector(".run-nerd-quote");
    expect(quote).toHaveTextContent("Stopped by R10. Injection risk 0.92 is at or over 0.39.");
    expect(quote?.textContent).not.toContain("?");
    expect(within(sheet).getByText("It tried to give Wally orders")).toBeInTheDocument();
  });
});

describe("recent purchases", () => {
  it("lists earlier purchases as links that pin one on this screen, with Back", async () => {
    const m = await mountRun();
    await m.run("normal");
    await m.run("flagged");
    const earlier = screen.getByRole("region", { name: "Earlier" });
    const link = within(earlier).getByRole("link", { name: /Cotton tee/ });
    const href = link.getAttribute("href") ?? "";
    expect(href).toMatch(/^#\/wally\?d=dec_/);
    await act(async () => {
      window.location.hash = href;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(await screen.findByRole("heading", { name: "Paid with a one-off card" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });
});
