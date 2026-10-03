// Your first budget (step three) when the booth is not an empty one, and the small things around the form: a budget that is
// over is not "ready", sealing over one says it starts a new budget, Skip says what it does on Check and seal, the loading frame
// has a way back, a missing category is focused, Enter in the typed amount goes on, and the taste hint tells the truth.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MockApiClient } from "../src/api/MockApiClient";
import type { BoothSnapshot } from "../src/api/types";
import { m0Request } from "../src/booth/compile";
import { FakeClock } from "@wally/core/testing";
import { FamilyMock, hello, instantMock, openFirstRun, skip, tourCard } from "./helpers/firstRun";

vi.setConfig({ testTimeout: 30_000 });

const nextButton = () => screen.getByRole("button", { name: /^Next/ });
const SKIP_NOTE = "Or skip to use a ready-made budget.";

async function toTaste(options: Parameters<typeof openFirstRun>[0] = {}) {
  const run = await openFirstRun(options);
  await hello();
  await run.user.click(nextButton());
  await screen.findByRole("heading", { level: 1, name: "What's your style?" });
  return run;
}

async function toBudget(options: Parameters<typeof openFirstRun>[0] = {}) {
  const run = await toTaste(options);
  await run.user.click(nextButton());
  return run;
}

describe("a budget that is over", () => {
  async function cancelled() {
    const api = instantMock();
    await api.seal(m0Request(new Date()));
    await api.revoke();
    return api;
  }

  it("is not called ready: the form is offered, and it does not promise to keep the old budget", async () => {
    await toBudget({ api: await cancelled() });
    expect(await screen.findByRole("heading", { level: 1, name: "Your first budget" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Your budget is ready" })).toBeNull();
    expect(await screen.findByRole("radiogroup", { name: "How much?" })).toBeInTheDocument();
    // Skip leaves the cancelled budget as it is; it seals nothing, so it has no ready-made budget to promise.
    expect(screen.queryByText(SKIP_NOTE)).toBeNull();
  });

  it("says on Check and seal that sealing starts a new budget and new receipts, and then it does", async () => {
    const api = await cancelled();
    const { user } = await toBudget({ api });
    await user.click(await screen.findByRole("radio", { name: "HK$500" }));
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    await screen.findByRole("heading", { level: 1, name: "Check and seal" });
    expect(screen.getByText("Sealing starts a new budget and new receipts.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Seal budget/ }));
    await screen.findByRole("heading", { level: 1, name: "Your budget is sealed" });
    const snap = await api.snapshot();
    expect(snap.packet?.status).toBe("ACTIVE");
    expect(snap.packet?.budget_minor).toBe(50_000);
  });

  it("says nothing about new receipts when there was no budget before", async () => {
    const { user } = await toBudget();
    await user.click(await screen.findByRole("button", { name: "Review budget" }));
    await screen.findByRole("heading", { level: 1, name: "Check and seal" });
    expect(screen.queryByText("Sealing starts a new budget and new receipts.")).toBeNull();
  });

  it("starts a family choice on the person's own budget, not on Mum's that was cancelled", async () => {
    class MumsCancelled extends FamilyMock {
      override async snapshot(): Promise<BoothSnapshot> {
        const snap = await super.snapshot();
        const parent = { mandate_id: "mnd_mumP0001", mandate_sha256: "a".repeat(64) };
        return { ...snap, mandate: snap.mandate === null ? null : { ...snap.mandate, parent } } as BoothSnapshot;
      }
    }
    const api = new MumsCancelled();
    await api.seal(m0Request(new Date()));
    await api.revoke();
    await toBudget({ api });
    const group = await screen.findByRole("radiogroup", { name: "Whose money?" });
    expect(within(group).getByRole("radio", { name: "My own budget" })).toBeChecked();
    expect(document.querySelector("[data-family-card]")).toBeNull();
  });
});

describe("Skip on Check and seal", () => {
  it("says it uses the ready-made budget, which is what it does", async () => {
    const { api, user } = await toBudget();
    await user.click(await screen.findByRole("radio", { name: "HK$300" }));
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    await screen.findByRole("heading", { level: 1, name: "Check and seal" });
    expect(screen.getByText(SKIP_NOTE)).toBeInTheDocument();
    await user.click(skip());
    expect(await tourCard()).toBeInTheDocument();
    expect((await api.snapshot()).packet?.budget_minor).toBe(80_000);
  });

  it("has no such note once the budget is sealed", async () => {
    const { user } = await toBudget();
    await user.click(await screen.findByRole("button", { name: "Review budget" }));
    await user.click(await screen.findByRole("button", { name: /Seal budget/ }));
    await screen.findByRole("heading", { level: 1, name: "Your budget is sealed" });
    expect(screen.queryByText(SKIP_NOTE)).toBeNull();
  });
});

describe("while the booth is still answering", () => {
  it("the budget step shows Back, so the person is not stuck on a skeleton", async () => {
    class NeverAnswers extends MockApiClient {
      constructor() {
        super({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
      }
      override info(): ReturnType<MockApiClient["info"]> {
        return new Promise(() => undefined);
      }
    }
    const { user } = await toBudget({ api: new NeverAnswers() });
    expect(await screen.findByText("Getting your budget ready")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { level: 1, name: "What's your style?" })).toBeInTheDocument();
  });
});

describe("the form's keyboard and errors", () => {
  it("a missing category moves focus to the first choice and is read with the group", async () => {
    const { user } = await toBudget();
    await user.click(await screen.findByRole("button", { name: "Clothes" }));
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    const group = screen.getByRole("group", { name: "What Wally can buy" });
    const message = screen.getByText("Pick at least one thing Wally can buy.");
    await waitFor(() => expect(within(group).getAllByRole("button")[0]).toHaveFocus());
    expect(group).toHaveAttribute("aria-describedby", message.closest("[id]")?.id);
  });

  it("Enter in the typed amount goes on to Check and seal", async () => {
    const { user } = await toBudget();
    await user.click(await screen.findByRole("radio", { name: "Custom" }));
    await user.type(screen.getByRole("textbox", { name: /^Amount/ }), "650{Enter}");
    expect(await screen.findByRole("heading", { level: 1, name: "Check and seal" })).toBeInTheDocument();
  });
});

describe("the taste step's hint", () => {
  const HINT = "These fill in your first budget.";

  it("says what they fill in when the first budget is still to be made", async () => {
    await toTaste();
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it("is left out when the booth already holds a budget, because there is no form to fill in", async () => {
    await toTaste({ sealed: true });
    await waitFor(() => expect(screen.queryByText(HINT)).toBeNull());
  });
});
