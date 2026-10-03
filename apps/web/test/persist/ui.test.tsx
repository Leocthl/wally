// What a person sees: the app on a client that kept its session (the budget, the purchase and the receipts are back, no
// second "Budget sealed"), the one-line note in About while the demo remembers, and the one-line note once when a stored
// session had to be dropped. The page start-up (pickClient) opens the same client on the page's own storage.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";
import { OnDeviceNote } from "../../src/api/local/OnDeviceNote";
import { SESSION_KEY } from "../../src/api/local/persist/record";
import { pickClient } from "../../src/api/local/select";
import type { ApiClient } from "../../src/api/types";
import { MemoryStorage } from "./memoryStorage";
import { rig, type Rig } from "./rig";
import { sealRequest } from "./support";

vi.setConfig({ testTimeout: 30_000 });

let current: Rig | null = null;
const opened: ApiClient[] = [];

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  current?.dispose();
  current = null;
  for (const client of opened.splice(0)) (client as { dispose?: () => void }).dispose?.();
  window.history.replaceState(null, "", "/");
});

/** A session HK$300 sealed with socks bought, kept, and the page "reloaded" onto it. */
async function reloadedApp(hash: string, storage = new MemoryStorage()) {
  current = rig(storage);
  const before = await current.boot();
  await before.seal(sealRequest(current.clock, 300));
  await before.runScenario("small");
  before.flush();
  before.dispose();
  const after = await current.boot();
  window.location.hash = hash;
  const view = render(<App api={after} />);
  await screen.findByRole("note");
  await waitFor(() => expect(document.querySelector("[data-route-loading]")).toBeNull());
  return { client: after, view, user: userEvent.setup() };
}

describe("the app on a restored session", () => {
  it("Budget shows the budget as it was: HK$180 left of HK$300, the socks card used, and no second seal", async () => {
    const { client } = await reloadedApp("#/budget");
    expect(await screen.findByRole("meter")).toHaveAttribute("aria-valuetext", "HK$180 left of HK$300, SIMULATED");
    const log = (await client.snapshot()).log.entries;
    expect(log.filter((e) => e.kind === "MANDATE_SEALED")).toHaveLength(1);
    expect(log.filter((e) => e.kind === "MANDATE_REVOKED")).toHaveLength(0);
  });

  it("Receipts lists the purchase as one row and one \"Budget sealed\", the same receipts as before the reload", async () => {
    await reloadedApp("#/receipts");
    await waitFor(() => expect(screen.getAllByText("Budget sealed")).toHaveLength(1));
    // One purchase is one row (its decision, its card and its charge are the "3 steps"); the seal is the other row.
    expect(screen.getAllByText(/Ankle socks, 3 pairs/)).toHaveLength(1);
    expect(document.querySelector("[data-steps-toggle]")?.textContent).toBe("3 steps");
    expect(screen.getByRole("radio", { name: /^All2/ })).toBeInTheDocument();
  });

  it("Proof checks the restored receipts on its own and says they hold", async () => {
    await reloadedApp("#/proof");
    await waitFor(() => expect(document.querySelector(".pf-card")).toHaveAttribute("data-status", "pass"));
  });
});

describe("About says the demo remembers, only while it does", () => {
  const LINE = "This demo remembers your session on this phone until you start it over.";

  async function aboutOf(storage: MemoryStorage) {
    current = rig(storage);
    const client = await current.boot();
    window.location.hash = "#/budget";
    render(<App api={client} />);
    await screen.findByRole("note");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /About and settings/ }));
    return { user, sheet: await screen.findByRole("dialog", { name: "About Wally" }) };
  }

  it("shows the line under the mode list when the session is kept", async () => {
    const { sheet } = await aboutOf(new MemoryStorage());
    const line = await within(sheet).findByText(LINE);
    expect(line.previousElementSibling?.tagName).toBe("UL"); // under "How this demo runs"
  });

  it("speaks 繁 when chosen", async () => {
    const { user, sheet } = await aboutOf(new MemoryStorage());
    await user.click(within(sheet).getAllByRole("radio", { name: "繁體中文" })[0]!);
    const zh = await screen.findByRole("dialog", { name: "關於 Wally" });
    expect(within(zh).getByText("呢個示範會喺呢部手機記住你嘅操作，直至你重新開始。")).toBeInTheDocument();
  });

  it("is not there when the browser will not keep anything", async () => {
    const blocked = new MemoryStorage();
    blocked.fail = { set: true };
    const { sheet } = await aboutOf(blocked);
    expect(within(sheet).getByText("In this browser, real rules, recorded answers")).toBeInTheDocument();
    expect(within(sheet).queryByText(LINE)).toBeNull();
  });
});

describe("OnDeviceNote", () => {
  it("says the answers are recorded and nothing else by default", () => {
    render(<OnDeviceNote />);
    expect(screen.getByText("Demo mode: Wally runs here on your phone with sample shop data. Nothing leaves your phone.")).toBeInTheDocument();
    expect(screen.queryByText(/session ended/)).toBeNull();
  });

  it("says once, calmly and in both languages, that the last demo session ended and a new one started", () => {
    render(<OnDeviceNote sessionEnded />);
    const line = screen.getByText("Your last demo session ended, so Wally started a new one");
    expect(line.closest("[data-api-mode]")).toHaveAttribute("data-api-mode", "local");
    expect(line.closest("p")?.querySelector('[lang="zh-HK"]')?.textContent).not.toBe("");
    expect(line.closest("[role]")).toBeNull(); // plain text in document order, like the line above it
  });
});

describe("pickClient on the page's own storage", () => {
  const forceLocal = (): void => window.history.replaceState(null, "", "/?api=local");

  it("keeps a session across two page starts, with nothing to say", async () => {
    forceLocal();
    const first = await pickClient();
    opened.push(first.api);
    expect(first.onDevice).toBe(true);
    expect(first.sessionEnded).toBe(false);
    await first.api.seal(sealRequest({ now: () => new Date() }, 300));
    await first.api.runScenario("small");
    (first.api as unknown as { flush(): void }).flush();
    const second = await pickClient();
    opened.push(second.api);
    expect(second.sessionEnded).toBe(false);
    const snap = await second.api.snapshot();
    expect(snap.packet?.remaining_minor).toBe(18_000);
    expect(snap.cards).toHaveLength(1);
  });

  it("starts new and says so when the stored session is damaged, and is quiet the time after", async () => {
    forceLocal();
    window.localStorage.setItem(SESSION_KEY, '{"v":1,"broken');
    const first = await pickClient();
    opened.push(first.api);
    expect(first.sessionEnded).toBe(true);
    expect((await first.api.snapshot()).mandate).toBeNull();
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
    const second = await pickClient();
    opened.push(second.api);
    expect(second.sessionEnded).toBe(false);
  });
});
