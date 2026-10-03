// Your first budget (step three) when the booth is not an empty one, and the small things around the form: a budget that is
// over is not "ready", sealing over one says it starts a new budget, Skip says what it does on Check and lock in, the loading frame
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
/** The note under the Skip link ("Skip uses a ready-made HK$800 budget for clothes."), or null when there is none. */
const skipNote = (): string | null => document.querySelector("[data-skip-note]")?.textContent?.replace(/\s+/g, " ").trim() ?? null;

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
    expect(skipNote()).toBeNull();
  });

  it("says on Check and lock in that sealing starts a new budget and new receipts, and then it does", async () => {
    const api = await cancelled();
    const { user } = await toBudget({ api });
    await user.click(await screen.findByRole("radio", { name: "HK$500" }));
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    await screen.findByRole("heading", { level: 1, name: "Check and lock in" });
    expect(screen.getByText("Locking in starts a new budget and new receipts.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Lock in budget/ }));
    await screen.findByRole("heading", { level: 1, name: "Your budget is locked in" });
    const snap = await api.snapshot();
    expect(snap.packet?.status).toBe("ACTIVE");
    expect(snap.packet?.budget_minor).toBe(50_000);
  });

  it("says nothing about new receipts when there was no budget before, not even once the seal has made one", async () => {
    const { user } = await toBudget();
    await user.click(await screen.findByRole("button", { name: "Review budget" }));
    await screen.findByRole("heading", { level: 1, name: "Check and lock in" });
    expect(screen.queryByText("Locking in starts a new budget and new receipts.")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Lock in budget/ }));
    await screen.findByRole("heading", { level: 1, name: "Your budget is locked in" });
    expect(screen.queryByText("Locking in starts a new budget and new receipts.")).toBeNull();
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

describe("Skip on Check and lock in", () => {
  it("says under the link that it uses the ready-made budget, which is what it does", async () => {
    const { api, user } = await toBudget();
    await user.click(await screen.findByRole("radio", { name: "HK$300" }));
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    await screen.findByRole("heading", { level: 1, name: "Check and lock in" });
    expect(skipNote()).toMatch(/^Skip uses a ready-made HK\$800 budget for clothes\./);
    await user.click(skip());
    expect(await tourCard()).toBeInTheDocument();
    expect((await api.snapshot()).packet?.budget_minor).toBe(80_000);
  });

  it("has no such note once the budget is sealed", async () => {
    const { user } = await toBudget();
    await user.click(await screen.findByRole("button", { name: "Review budget" }));
    await user.click(await screen.findByRole("button", { name: /Lock in budget/ }));
    await screen.findByRole("heading", { level: 1, name: "Your budget is locked in" });
    expect(skipNote()).toBeNull();
  });
});

describe("a typed amount above what one card can hold", () => {
  const typeAmount = async (user: Awaited<ReturnType<typeof toBudget>>["user"], text: string) => {
    await user.click(await screen.findByRole("radio", { name: "Custom" }));
    const field = await screen.findByRole("textbox", { name: /^Amount/ });
    await user.type(field, text);
    return field;
  };

  it("is cut to HK$2,000 with a note, then locked in at that, instead of the page falling over", async () => {
    const { api, user } = await toBudget();
    await typeAmount(user, "9007199254740993");
    expect(document.querySelector("[data-amount-cut]")?.textContent).toMatch(/A budget can be HK\$2,000 at most, the limit of one card, so the amount is set to that\./);
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    await screen.findByRole("heading", { level: 1, name: "Check and lock in" });
    expect(document.querySelector(".seal-summary")).toHaveTextContent("HK$2,000");
    await user.click(screen.getByRole("button", { name: /Lock in budget/ }));
    await screen.findByRole("heading", { level: 1, name: "Your budget is locked in" });
    expect((await api.snapshot()).packet?.budget_minor).toBe(200_000);
  });

  it("says nothing at HK$2,000 and below, and the note goes when the number comes back down", async () => {
    const { user } = await toBudget();
    const field = await typeAmount(user, "2000");
    expect(document.querySelector("[data-amount-cut]")).toBeNull();
    await user.type(field, "1");
    expect(document.querySelector("[data-amount-cut]")).not.toBeNull();
    await user.type(field, "{Backspace}");
    expect(document.querySelector("[data-amount-cut]")).toBeNull();
  });

  it("still names a typo as one", async () => {
    const { user } = await toBudget();
    await typeAmount(user, "12abc");
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    expect(await screen.findByText("Use digits only, with up to two decimals.")).toBeInTheDocument();
    expect(document.querySelector("[data-amount-cut]")).toBeNull();
  });

  it("is worded in 繁體 too", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.click(screen.getByRole("radio", { name: "繁體中文" }));
    await user.click(await screen.findByRole("button", { name: "下一步" }));
    await screen.findByRole("heading", { level: 1, name: "你鍾意咩風格？" });
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await screen.findByRole("heading", { level: 1, name: "你的第一個預算" });
    await user.click(await screen.findByRole("radio", { name: "自訂" }));
    await user.type(await screen.findByRole("textbox", { name: /^金額/ }), "5000");
    expect(document.querySelector("[data-amount-cut]")?.textContent).toMatch(/一個預算最多 HK\$2,000，即一張卡嘅上限，所以金額已設為上限。/);
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

  it("Enter in the typed amount goes on to Check and lock in", async () => {
    const { user } = await toBudget();
    await user.click(await screen.findByRole("radio", { name: "Custom" }));
    await user.type(screen.getByRole("textbox", { name: /^Amount/ }), "650{Enter}");
    expect(await screen.findByRole("heading", { level: 1, name: "Check and lock in" })).toBeInTheDocument();
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
