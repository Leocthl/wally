// Mum's budget in the app (family budget): the "Whose money?" choice in the Seal flow, the ceiling card, the capped amount
// field, the request that is sent, the Budget tag, and the two Try asking cards. Everything is hidden when the booth does not
// offer family budgets (info.features.family), and my own budget behaves exactly as before.
import { FakeClock } from "@laisee/core/testing";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { MockApiClient } from "../src/api/MockApiClient";
import type { ApiInfo, ExportView, FamilySummary, Mandate, PacketState, RunSummary, ScenarioId, SealRequest, SealResult } from "../src/api/types";
import { BudgetHero } from "../src/screens/home/BudgetHero";
import { LocaleProvider } from "../src/ui/locale";
import { ProofScreen } from "../src/screens/proof/ProofScreen";
import { bootApp, go, screenReady } from "./helpers/app";
import { bareFigures, numsWithoutChip } from "./helpers/figures";
import { delegate, instantMock, mountScreen, seed } from "./helpers/proofHarness";

vi.setConfig({ testTimeout: 30_000 });

const MUM: FamilySummary = {
  parent: "mum",
  mandateId: "mnd_mumP0001",
  issuer: "did:key:z6MkMumKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  ceilingMinor: 100_000,
  allocatedMinor: 0,
  remainingMinor: 100_000,
  validUntil: "2026-10-31T15:59:59Z",
  categories: ["apparel"],
  verifiedSellersOnly: true,
};

/** The offline mock with family budgets switched on: it records what is sealed and refuses what Mum would refuse. */
class FamilyMock extends MockApiClient {
  readonly sealed: SealRequest[] = [];
  ran: ScenarioId[] = [];
  failFamily = false;

  constructor() {
    super({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
  }

  override async info(): Promise<ApiInfo> {
    const info = await super.info();
    return { ...info, features: { ...info.features, family: true } };
  }

  async family(): Promise<FamilySummary> {
    if (this.failFamily) throw new Error("the booth does not know Mum");
    return MUM;
  }

  override seal(req: SealRequest): Promise<SealResult> {
    this.sealed.push(req);
    if (req.family !== undefined && req.rules.budget.amount_minor > MUM.ceilingMinor) {
      return Promise.reject(Object.assign(new Error("That's more than Mum allows (HK$1,000)."), { code: "EXCEEDS_PARENT" }));
    }
    return super.seal(req);
  }

  override runScenario(id: ScenarioId): Promise<RunSummary> {
    this.ran = [...this.ran, id];
    if (id === "family_over") return Promise.resolve({ runId: "run_family01", scenario: id, outcome: "DENY", code: "EXCEEDS_PARENT", note: "That's more than Mum allows (HK$1,000)." });
    return super.runScenario(id);
  }
}

async function boot(api: MockApiClient, hash: string): Promise<{ user: ReturnType<typeof userEvent.setup> }> {
  window.localStorage.clear();
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App api={api} /> as ReactElement);
  await screen.findByRole("note");
  await waitFor(async () => expect((await api.snapshot()).mandate).not.toBeNull());
  await screenReady();
  return { user };
}

const amount = () => screen.getByRole("textbox", { name: /^Amount/ });
const next = () => screen.getByRole("button", { name: /^Next/ });
const choice = () => screen.queryByRole("radiogroup", { name: "Whose money?" });
const mumOption = () => screen.getByRole("radio", { name: "Mum's budget" });

describe("when the booth has no family budget", () => {
  it("shows no choice in Seal and no Mum cards in Try asking", async () => {
    const h = await bootApp("#/seal?mode=topup");
    expect(await screen.findByRole("heading", { level: 1, name: "Top up your budget" })).toBeInTheDocument();
    expect(choice()).toBeNull();
    expect(screen.queryByText("Whose money?")).toBeNull();
    await go("#/budget");
    expect(document.querySelector('[data-scenario="family_ok"]')).toBeNull();
    expect(document.querySelector('[data-scenario="family_over"]')).toBeNull();
    expect(h.api.kind).toBe("mock");
  });

  it("a client that offers the flag but no family() shows nothing either", async () => {
    class NoMethod extends FamilyMock {}
    const api = new NoMethod();
    (api as unknown as { family: undefined }).family = undefined;
    await boot(api, "#/seal?mode=topup");
    expect(await screen.findByRole("heading", { level: 1, name: "Top up your budget" })).toBeInTheDocument();
    expect(choice()).toBeNull();
  });
});

describe("a booth that does not say what it can do (an older server)", () => {
  class OldServer extends FamilyMock {
    override async info(): Promise<ApiInfo> {
      const { features: _gone, ...rest } = await super.info();
      return rest as unknown as ApiInfo;
    }
  }

  it("shows Budget and Seal as before, with no family anything and no crash", async () => {
    await boot(new OldServer(), "#/budget");
    expect(await screen.findByRole("meter")).toBeInTheDocument();
    expect(document.querySelector('[data-scenario="family_ok"]')).toBeNull();
    await go("#/seal?mode=topup");
    expect(await screen.findByRole("heading", { level: 1, name: "Top up your budget" })).toBeInTheDocument();
    expect(choice()).toBeNull();
  });
});

describe("Whose money? in Seal", () => {
  it("starts on my own budget with no card, and changes nothing about the request", async () => {
    const api = new FamilyMock();
    const { user } = await boot(api, "#/seal?mode=topup");
    expect(await screen.findByRole("heading", { level: 1, name: "Top up your budget" })).toBeInTheDocument();
    expect(choice()).not.toBeNull();
    expect(screen.getByRole("radio", { name: "My own budget" })).toBeChecked();
    expect(mumOption()).not.toBeChecked();
    expect(document.querySelector("[data-family-card]")).toBeNull();
    await user.click(next());
    await user.click(screen.getByRole("button", { name: /Seal budget/ }));
    await screen.findByRole("heading", { level: 1, name: "Your budget is sealed" });
    expect(api.sealed.at(-1)).not.toHaveProperty("family");
    expect(api.sealed.at(-1)?.rules.budget.amount_minor).toBe(80_000);
  });

  it("Mum's budget shows what she allows as a calm card, with figures that wear their chip", async () => {
    const api = new FamilyMock();
    const { user } = await boot(api, "#/seal?mode=topup");
    await user.click(mumOption());
    const card = await waitFor(() => {
      const el = document.querySelector<HTMLElement>("[data-family-card]");
      if (!el || !/HK\$1,000/.test(el.textContent ?? "")) throw new Error("no ceiling yet");
      return el;
    });
    expect(card).toHaveTextContent(/^Mum allows up to HK\$1,000 for clothes until 31 Oct/);
    expect(card).toHaveTextContent("Wally's budget can never be more than Mum allows.");
    expect(card).toHaveAttribute("role", "status");
    expect(numsWithoutChip(document.querySelector("main")!)).toEqual([]);
    expect(bareFigures(card)).toEqual([]);
    expect(mumOption()).toBeChecked();
  });

  it("caps the amount: over what Mum allows says so beside the field and Next does not go on", async () => {
    const api = new FamilyMock();
    const { user } = await boot(api, "#/seal?mode=topup");
    const sealedBefore = api.sealed.length; // the preset budget was sealed on load
    await user.click(mumOption());
    await screen.findByText(/Mum allows up to/);
    await user.clear(amount());
    await user.type(amount(), "1500");
    expect(amount()).toHaveAttribute("aria-invalid", "true");
    expect(amount()).toHaveAccessibleDescription(/That's more than Mum allows \(HK\$1,000\)$/);
    await user.click(next());
    expect(screen.getByRole("heading", { level: 1, name: "Top up your budget" })).toBeInTheDocument();
    expect(amount()).toHaveFocus();
    expect(api.sealed).toHaveLength(sealedBefore);
    await user.clear(amount());
    await user.type(amount(), "1000"); // exactly the ceiling is fine
    expect(amount()).not.toHaveAttribute("aria-invalid", "true");
    await user.clear(amount());
    await user.type(amount(), "900");
    await user.click(next());
    expect(screen.getByRole("heading", { level: 1, name: "Check and seal" })).toBeInTheDocument();
  });

  it("the cap leaves with the choice: back on my own budget the same amount seals", async () => {
    const api = new FamilyMock();
    const { user } = await boot(api, "#/seal?mode=topup");
    await user.click(mumOption());
    await screen.findByText(/Mum allows up to/);
    await user.clear(amount());
    await user.type(amount(), "1500");
    expect(screen.getByText("That's more than Mum allows (HK$1,000)")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "My own budget" }));
    expect(screen.queryByText("That's more than Mum allows (HK$1,000)")).toBeNull();
    expect(document.querySelector("[data-family-card]")).toBeNull();
    await user.click(next());
    await user.click(screen.getByRole("button", { name: /Seal budget/ }));
    await screen.findByRole("heading", { level: 1, name: "Your budget is sealed" });
    expect(api.sealed.at(-1)).not.toHaveProperty("family");
    expect(api.sealed.at(-1)?.rules.budget.amount_minor).toBe(150_000);
  });

  it("seals under Mum's with { family: { parent: 'mum' } } and the typed amount", async () => {
    const api = new FamilyMock();
    const { user } = await boot(api, "#/seal?mode=topup");
    await user.click(mumOption());
    await screen.findByText(/Mum allows up to/);
    await user.clear(amount());
    await user.type(amount(), "900");
    await user.click(next());
    await user.click(screen.getByRole("button", { name: /Seal budget/ }));
    await screen.findByRole("heading", { level: 1, name: "Your budget is sealed" });
    expect(api.sealed.at(-1)).toMatchObject({ family: { parent: "mum" }, rules: { budget: { amount_minor: 90_000 } } });
  });

  it("says plainly when Mum's budget cannot be read, and my own budget still works", async () => {
    const api = new FamilyMock();
    api.failFamily = true;
    const { user } = await boot(api, "#/seal?mode=topup");
    await user.click(mumOption());
    expect(await screen.findByText("Can't reach Mum's budget right now. Your own budget still works.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "My own budget" }));
    await user.click(next());
    expect(screen.getByRole("heading", { level: 1, name: "Check and seal" })).toBeInTheDocument();
  });

  it("reads in 繁 with the same figures", async () => {
    const api = new FamilyMock();
    const { user } = await boot(api, "#/seal?mode=topup");
    await user.click(screen.getByRole("radio", { name: "繁體中文" }));
    expect(screen.getByRole("radiogroup", { name: "用邊個的錢？" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "媽媽的預算" }));
    const card = await waitFor(() => {
      const el = document.querySelector<HTMLElement>("[data-family-card]");
      if (!el || !/HK\$1,000/.test(el.textContent ?? "")) throw new Error("no ceiling yet");
      return el;
    });
    expect(card).toHaveTextContent("媽媽容許最多 HK$1,000 用於衣物，有效至 10月31日");
    const field = screen.getByRole("textbox", { name: /^金額/ });
    await user.clear(field);
    await user.type(field, "1500");
    expect(field).toHaveAccessibleDescription(/超過媽媽容許的上限（HK\$1,000）$/);
  });
});

describe("a budget from Mum's", () => {
  const packet: PacketState = {
    log_id: "log_mei00001",
    mandate_id: "mnd_mei00001",
    status: "ACTIVE",
    currency: "HKD",
    budget_minor: 80_000,
    spent_minor: 0,
    committed_minor: 0,
    remaining_minor: 80_000,
    active_cards: [],
    mint_times: [],
    open_escalations: [],
    expires_at: "2026-10-31T15:59:59Z",
    folded_through_seq: 0,
    computed_at: "2026-10-03T02:00:00Z",
  };
  const mandate: Mandate = {
    id: "mnd_mei00001",
    delegator: "did:key:z6MkMeiKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    agent: "did:key:z6MkAgentKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    intent_text: "HK$800, clothes, verified sellers.",
    rules: { budget: { amount_minor: 80_000, currency: "HKD" }, categories: ["apparel"], merchants: { allow: null, deny: [] }, seller_check: { require_capture: true } },
    valid_from: "2026-10-03T02:00:00Z",
    valid_until: "2026-10-31T15:59:59Z",
  };
  const hero = (m: Mandate) => {
    window.localStorage.clear(); // a language chosen by an earlier test must not carry over
    return render(
      <LocaleProvider>
        <div data-chip-scope>
          <BudgetHero packet={packet} mandate={m} />
        </div>
      </LocaleProvider>,
    );
  };

  it("wears a From Mum's budget tag on the Budget card", () => {
    hero({ ...mandate, parent: { mandate_id: "mnd_mumP0001", mandate_sha256: "a".repeat(64) } });
    const tags = within(screen.getByRole("list", { name: "Rules Wally must follow" }));
    expect(tags.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["From Mum's budget", "Clothes only", "Verified sellers", "Signed rules"]);
  });

  it("has no such tag on a budget of my own", () => {
    hero(mandate);
    expect(screen.queryByText("From Mum's budget")).toBeNull();
  });
});

describe("Try asking", () => {
  it("adds Mum's budget (two cards) only when the booth offers it", async () => {
    await boot(new FamilyMock(), "#/budget");
    const group = await screen.findByRole("group", { name: "Mum's budget" });
    expect(within(group).getAllByRole("button").map((b) => b.getAttribute("data-scenario"))).toEqual(["family_ok", "family_over"]);
    expect(group).toHaveTextContent("Use Mum's budget");
    expect(group).toHaveTextContent("Ask for more than Mum allows");
  });

  it("family_ok runs like any scenario and shows Wally", async () => {
    const api = new FamilyMock();
    const { user } = await boot(api, "#/budget");
    await user.click(await screen.findByRole("button", { name: /Use Mum's budget/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/wally"));
    expect(api.ran).toContain("family_ok");
  });

  it("family_over stays on Budget and says what Mum allows, the budget held untouched", async () => {
    const api = new FamilyMock();
    const { user } = await boot(api, "#/budget");
    const before = await api.snapshot();
    await user.click(await screen.findByRole("button", { name: /Ask for more than Mum allows/ }));
    expect(await screen.findByText("That's more than Mum allows (HK$1,000). Nothing was sealed. Your budget stays as it was.")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/budget");
    expect(api.ran).toEqual(["family_over"]);
    expect((await api.snapshot()).mandate?.id).toBe(before.mandate?.id);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
  });
});

describe("Export receipts", () => {
  async function exportSheet(parentCredential?: unknown) {
    const { api, clock } = instantMock();
    await seed(api, clock, ["normal"]);
    const exportLog = async (): Promise<ExportView> => ({
      log: '{"seq":0}',
      publicKeys: { note: "test", engine: ["did:key:z1"], delegator: "did:key:z2", agent: "did:key:z3" },
      checkpoint: { log_id: "l", seq: 0, entry_hash: "a" },
      ...(parentCredential === undefined ? {} : { parentCredential }),
    });
    const { user } = await mountScreen(<ProofScreen />, delegate(api, { exportLog }), { hash: "#/proof" });
    await user.click(await screen.findByRole("button", { name: "Export receipts" }));
    return within(await screen.findByRole("dialog", { name: "Export for the offline verifier" }));
  }

  it("a budget from Mum's adds her credential as parent-credential.json, and says the offline page cannot check the link", async () => {
    const sheet = await exportSheet({ issuer: "did:key:z6MkMum", id: "urn:laisee:mandate:mnd_mumP0001" });
    await waitFor(() => expect(sheet.getAllByRole("link")).toHaveLength(4));
    expect(sheet.getByRole("link", { name: /Mum's credential \(JSON\)/ })).toHaveAttribute("download", "parent-credential.json");
    expect(sheet.getByText(/can't check this link/)).toBeInTheDocument();
  });

  it("a budget of my own still exports three files and no note", async () => {
    const sheet = await exportSheet();
    await waitFor(() => expect(sheet.getAllByRole("link")).toHaveLength(3));
    expect(sheet.queryByText(/can't check this link/)).toBeNull();
  });
});
