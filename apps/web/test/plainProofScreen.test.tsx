// #/proof in plain mode (the default): the screen checks the receipts on its own when it opens and says the verdict first,
// a timeline in words lists every receipt with its own status, "Try changing one receipt" shows a changed copy caught by
// the check and "Put it back" restores it, and every line is plain: no hash, code or rule id outside "Show the details".
import { act, screen, waitFor, within } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ApiInfo, VerifyOutcome } from "../src/api/types";
import { useBoothContext, type Booth } from "../src/hooks/useBooth";
import { ProofScreen } from "../src/screens/proof/ProofScreen";
import { developerMode } from "./helpers/devMode";
import { bareFigures, numsWithoutChip } from "./helpers/figures";
import { delegate, emptyClient, instantMock, mountBare, mountScreen, seed } from "./helpers/proofHarness";

vi.setConfig({ testTimeout: 20_000 });

type Mock = ReturnType<typeof instantMock>["api"];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const bad = (failedSeq: number, reason: string): VerifyOutcome =>
  ({ result: { ok: false, failedSeq, reason }, checked: ["SCHEMA", "SEQ"], skipped: [], at: "2026-10-03T02:00:00Z" }) as unknown as VerifyOutcome;

/** The mock behind a counting verify. Every call is noted with the newest receipt it was asked about. */
function counted(api: Mock, extra: Record<string, unknown> = {}) {
  const heads: (number | null)[] = [];
  const verify = vi.fn(async () => {
    heads.push((await api.getLog()).head?.seq ?? null);
    return api.verify();
  });
  return { client: delegate(api, { verify, ...extra }), verify, heads };
}

interface Opened {
  readonly user: Awaited<ReturnType<typeof mountScreen>>["user"];
  readonly api: Mock;
  readonly verify: ReturnType<typeof counted>["verify"];
  readonly heads: (number | null)[];
}

async function proof(opts: { readonly steps?: Parameters<typeof seed>[2]; readonly locale?: "en" | "zh-HK"; readonly settle?: boolean; readonly extra?: (api: Mock) => Record<string, unknown>; readonly ui?: ReactElement } = {}): Promise<Opened> {
  const { api, clock } = instantMock();
  await seed(api, clock, opts.steps ?? ["normal"]);
  const { client, verify, heads } = counted(api, opts.extra?.(api) ?? {});
  const view = await mountScreen(opts.ui ?? <ProofScreen />, client, { hash: "#/proof", ...(opts.locale ? { locale: opts.locale } : {}) });
  if (opts.settle !== false) await waitFor(() => expect(card()).toHaveAttribute("data-status", "pass"));
  return { user: view.user, api, verify, heads };
}

const card = (): HTMLElement => document.querySelector<HTMLElement>(".pf-card")!;
const rows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(".pf-tl__item")];
const statusesOfRows = (): (string | null)[] => rows().map((r) => r.getAttribute("data-status"));

describe("Proof (plain): the automatic check", () => {
  it("checks on its own when it opens, so the first thing shown is a verdict", async () => {
    const { verify } = await proof();
    expect(card()).toHaveTextContent("All 4 receipts are untouched");
    expect(card()).toHaveTextContent("Nothing was changed, removed or moved since Wally wrote them.");
    expect(card().querySelector(".pf-card__where")).toHaveTextContent("Checked on this phone just now.");
    expect(verify).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-screen="proof"]')).toHaveAttribute("data-mode", "plain");
  });

  it("says one receipt in the singular", async () => {
    await proof({ steps: [] });
    expect(card()).toHaveTextContent("Your receipt is untouched");
    expect(card()).toHaveTextContent("Nothing was changed or removed since Wally wrote it.");
  });

  it("shows the check running, with every row still neutral, then the verdict", async () => {
    const wait = deferred<VerifyOutcome>();
    const { api } = await proof({ settle: false, extra: () => ({ verify: () => wait.promise }) });
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "checking"));
    expect(card()).toHaveTextContent("Checking your receipts");
    expect(card().querySelector(".w-btn")).toHaveAttribute("aria-busy", "true");
    expect(statusesOfRows()).toEqual(["idle", "idle", "idle", "idle"]);
    await act(async () => wait.resolve(await api.verify()));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "pass"));
    expect(statusesOfRows()).toEqual(["ok", "ok", "ok", "ok"]);
  });

  it("starts in the checking state: no flash of a ready-to-check card before the check begins", async () => {
    const onScreen: (string | null)[] = [];
    await proof({
      extra: (api) => ({
        verify: async () => {
          onScreen.push(card()?.getAttribute("data-status") ?? null);
          return api.verify();
        },
      }),
    });
    expect(onScreen).toEqual(["checking"]);
  });

  it("never shows an earlier visit's verdict as this visit's, and asks when the new check cannot run", async () => {
    const { api, clock } = instantMock();
    await seed(api, clock, ["normal"]);
    let broken = false;
    const onScreen: (string | null)[] = [];
    const client = delegate(api, {
      verify: async () => {
        onScreen.push(card()?.getAttribute("data-status") ?? null);
        if (broken) throw new Error("the booth did not answer");
        return api.verify();
      },
    });
    let leave!: () => void;
    let comeBack!: () => void;
    function Visits(): ReactElement | null {
      const [here, setHere] = useState(true);
      leave = () => setHere(false);
      comeBack = () => setHere(true);
      return here ? <ProofScreen /> : null;
    }
    await mountScreen(<Visits />, client, { hash: "#/proof" });
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "pass"));
    act(() => leave());
    expect(document.querySelector('[data-screen="proof"]')).toBeNull();
    broken = true;
    act(() => comeBack());
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "idle"));
    // Both visits began by checking: the second never put the first one's "untouched" on screen.
    expect(onScreen).toEqual(["checking", "checking"]);
    expect(card()).not.toHaveTextContent("untouched");
    expect(statusesOfRows()).toEqual(["idle", "idle", "idle", "idle"]);
  });

  it("checks again when a receipt arrives, once per new state and never twice for the same one", async () => {
    const { api, verify, heads } = await proof();
    await act(async () => {
      await api.runScenario("small");
    });
    await waitFor(() => expect(card()).toHaveTextContent("All 7 receipts are untouched"));
    expect(verify.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(new Set(heads).size).toBe(heads.length);
    expect(heads.at(-1)).toBe(6);
    const settled = verify.mock.calls.length;
    await new Promise((r) => setTimeout(r, 40));
    expect(verify.mock.calls.length).toBe(settled);
  });

  it("waits while another call is running, says so, and checks when it ends", async () => {
    let booth!: Booth;
    function Probe() {
      booth = useBoothContext();
      return null;
    }
    const { api, verify } = await proof({ ui: <><ProofScreen /><Probe /></> });
    const busy = deferred<void>();
    act(() => {
      void booth.exec(() => busy.promise);
    });
    await act(async () => {
      await api.runScenario("small");
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(verify).toHaveBeenCalledTimes(1);
    expect(card()).toHaveTextContent("New receipts since this check. Check again to include them.");
    await act(async () => busy.resolve());
    await waitFor(() => expect(card()).toHaveTextContent("All 7 receipts are untouched"));
    expect(verify).toHaveBeenCalledTimes(2);
    expect(card()).not.toHaveTextContent("New receipts since this check");
  });

  it("does not try again by itself when the check fails to run: the person gets a button", async () => {
    const calls = vi.fn(async (): Promise<VerifyOutcome> => {
      throw new Error("the booth did not answer");
    });
    const { user } = await proof({ settle: false, extra: () => ({ verify: calls }) });
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "idle"));
    expect(card()).toHaveTextContent("4 receipts, signed and linked");
    expect(card()).toHaveTextContent("Check that none changed.");
    await new Promise((r) => setTimeout(r, 60));
    expect(calls).toHaveBeenCalledTimes(1);
    expect(statusesOfRows()).toEqual(["idle", "idle", "idle", "idle"]);
    await user.click(within(card()).getByRole("button", { name: "Check receipts" }));
    await waitFor(() => expect(calls).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 60));
    expect(calls).toHaveBeenCalledTimes(2);
    expect(card()).toHaveAttribute("data-status", "idle");
  });

  it("checks once more on request, and the button is the one inside the card", async () => {
    const { user, verify } = await proof();
    const buttons = card().querySelectorAll(".w-btn");
    expect(buttons).toHaveLength(1);
    await user.click(within(card()).getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "pass"));
    await new Promise((r) => setTimeout(r, 40));
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it("says where the check ran: the booth laptop for the HTTP client", async () => {
    await proof({ extra: (api) => ({ kind: "http", info: async () => ({ ...(await api.info()), kind: "http" }) as ApiInfo }) });
    expect(card().querySelector(".pf-card__where")).toHaveTextContent("Checked by the booth laptop just now.");
    expect(card()).not.toHaveTextContent("this phone");
  });

  it("says what this demo mode does not check, instead of implying it", async () => {
    await proof();
    expect(card()).toHaveTextContent("This demo mode does not check the signatures.");
  });
});

describe("Proof (plain): the changed copy", () => {
  it("Try changing one receipt: the check fails at that receipt in plain words, one sentence says what changed, and Put it back restores", async () => {
    const { user, verify } = await proof();
    expect(screen.getByText("We change one digit in a copy, then check the copy. Your real receipts are never touched.")).toBeInTheDocument();
    expect(document.querySelector("[data-tampered-copy]")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try changing one receipt" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "fail"));
    expect(card()).toHaveTextContent("Receipt 2 was changed");
    expect(card()).toHaveTextContent("What this receipt says was changed after it was written.");
    expect(card()).toHaveTextContent("Receipts before it are untouched.");
    expect(card()).toHaveTextContent("Receipts after it were not checked, because one change breaks the rest.");
    expect(card()).not.toHaveTextContent("PAYLOAD_HASH");
    expect(document.querySelector("[data-tampered-copy]")).toHaveTextContent(
      "We changed the cart total on receipt 2 in a copy, from HK$259 to HK$359, and the check caught it, because each receipt is locked to the one before it. Your real receipts were not touched.",
    );
    expect(screen.queryByRole("button", { name: "Try changing one receipt" })).toBeNull();
    expect(screen.getByText("Puts the original back and checks again.")).toBeInTheDocument();
    expect(statusesOfRows()).toEqual(["ok", "changed", "after", "after"]);
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Put it back" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "pass"));
    expect(document.querySelector("[data-tampered-copy]")).toBeNull();
    expect(screen.getByRole("button", { name: "Try changing one receipt" })).toBeEnabled();
    expect(statusesOfRows()).toEqual(["ok", "ok", "ok", "ok"]);
    // Open, tamper, restore: one check each. The screen's own actions verify themselves and are not checked a second time.
    await new Promise((r) => setTimeout(r, 60));
    expect(verify).toHaveBeenCalledTimes(3);
  });

  it("keeps the demo button inside .pf-actions and the changed row tagged, tinted and followed by rows not checked", async () => {
    const { user } = await proof();
    expect(document.querySelectorAll(".pf-actions .w-btn")).toHaveLength(1);
    await user.click(document.querySelector<HTMLButtonElement>(".pf-actions .w-btn")!);
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "fail"));
    const [first, changed, after1, after2] = rows();
    expect(first).toHaveTextContent("Untouched");
    expect(changed).toHaveTextContent("Changed");
    expect(after1).toHaveTextContent("Not checked");
    expect(after2).toHaveTextContent("Not checked");
    expect(changed).toHaveAttribute("data-status", "changed");
    expect(document.querySelectorAll(".pf-actions .w-btn")).toHaveLength(1);
  });

  it("opens on the changed copy when it was left changed, and says what changed", async () => {
    const { api, clock } = instantMock();
    await seed(api, clock, ["normal"]);
    await api.tamper();
    await mountScreen(<ProofScreen />, api, { hash: "#/proof" });
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "fail"));
    expect(document.querySelector("[data-tampered-copy]")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Put it back" })).toBeInTheDocument();
  });

  it("says a failure code it does not know in a safe sentence and never shows the code", async () => {
    await proof({ settle: false, extra: () => ({ verify: async () => bad(2, "SOMETHING_NEW") }) });
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "fail"));
    expect(card()).toHaveTextContent("Receipt 3 was changed");
    expect(card()).toHaveTextContent("This receipt failed a check this screen does not know yet.");
    expect(card().textContent).not.toContain("SOMETHING_NEW");
    expect(statusesOfRows()).toEqual(["ok", "ok", "changed", "after"]);
  });

  it("keeps the code inside the failed receipt's details", async () => {
    const { user } = await proof({ settle: false, extra: () => ({ verify: async () => bad(1, "PREV_HASH") }) });
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "fail"));
    expect(card()).toHaveTextContent("This receipt no longer fits the one before it.");
    expect(document.body.textContent).not.toContain("PREV_HASH");
    await user.click(rows()[1]!.querySelector("summary")!);
    expect(rows()[1]!.querySelector("[data-reason]")).toHaveTextContent("PREV_HASH");
  });

  it("says nothing was cut off when the first receipt is the one that changed", async () => {
    await proof({ settle: false, extra: () => ({ verify: async () => bad(0, "SCHEMA") }) });
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "fail"));
    expect(card()).toHaveTextContent("Receipt 1 was changed");
    expect(card()).not.toHaveTextContent("Receipts before it are untouched.");
    expect(card()).toHaveTextContent("Receipts after it were not checked");
  });
});

describe("Proof (plain): your receipts, in order", () => {
  it("lists one row per receipt, oldest first, in words, with the shop, the amount and the time", async () => {
    await proof();
    const titles = rows().map((r) => r.querySelector(".pf-tl__title")?.textContent);
    expect(titles).toEqual(["Budget sealed", "Approved", "One-off card made", "Charged"]);
    expect(rows().map((r) => r.querySelector(".pf-tl__sub")?.textContent)).toEqual([
      "Receipt 1 · Untouched",
      "Receipt 2 · Untouched",
      "Receipt 3 · Untouched",
      "Receipt 4 · Untouched",
    ]);
    expect(rows()[0]).toHaveTextContent("HK$800");
    expect(rows()[1]).toHaveTextContent("HK$259");
    expect(rows()[1]!.querySelector(".pf-tl__what")?.textContent).toContain(" · ");
    expect(rows()[3]).toHaveTextContent("HK$259");
    const scope = document.querySelector(".pf-tl__scope")!;
    expect(scope.querySelector(':scope > .chip-scope__chips [data-prov="SIMULATED"]')).not.toBeNull();
    expect(scope.querySelectorAll("[data-kind='time']").length).toBe(4);
    expect(screen.getByRole("heading", { level: 2, name: "Your receipts, in order" })).toBeInTheDocument();
    expect(numsWithoutChip(document.body)).toEqual([]);
    expect(bareFigures(document.body)).toEqual([]);
  });

  it("keeps hashes and signers out of the rows until a receipt's details are opened, and never shows the raw receipt", async () => {
    const { user, api } = await proof();
    const entries = (await api.getLog()).entries;
    const list = document.querySelector(".pf-tl")!;
    expect(list.textContent).not.toMatch(/[0-9a-f]{8}/);
    expect(list.querySelector("pre")).toBeNull();
    expect(list.querySelector("details[open]")).toBeNull();
    await user.click(rows()[1]!.querySelector("summary")!);
    const details = rows()[1]!.querySelector(".pf-tl__details")!;
    expect(details).toHaveTextContent("This is receipt 2.");
    expect(details).toHaveTextContent(/Written at \d{4}-\d{2}-\d{2} \d{2}:\d{2}, Hong Kong time\./);
    expect(details).toHaveTextContent(`Locked to receipt 1 by its fingerprint ${entries[1]!.prev_hash.slice(0, 8)}.`);
    expect(details).toHaveTextContent(`Signed by Wally. Key ending ${entries[1]!.signer.slice(-8)}.`);
    expect(details.querySelector("pre")).toBeNull();
    expect(details.textContent).not.toContain(entries[1]!.entry_hash);
    expect(rows()[0]!.querySelector(".pf-tl__details")).toBeNull();
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
    await user.click(rows()[1]!.querySelector("summary")!);
    expect(rows()[1]!.querySelector(".pf-tl__details")).toBeNull();
  });

  it("says the first receipt starts the chain, and that you signed your budget", async () => {
    const { user } = await proof();
    await user.click(rows()[0]!.querySelector("summary")!);
    const details = rows()[0]!.querySelector(".pf-tl__details")!;
    expect(details).toHaveTextContent("It is the first receipt, so nothing comes before it.");
    expect(details).toHaveTextContent("Signed by Wally, and also by you.");
  });

  it("is an ordered list; every row is a disclosure that says what it opens", async () => {
    await proof();
    expect(document.querySelector("ol.pf-tl")).not.toBeNull();
    for (const row of rows()) {
      expect(row.querySelector("summary")).not.toBeNull();
      expect(row.querySelector("summary .sr-only")).toHaveTextContent("Show the details");
    }
  });

  it("keeps every receipt of a long log, checks it, and finds the change among two hundred", async () => {
    const started = performance.now();
    const { user } = await proof({ steps: Array.from({ length: 199 }, () => "flagged" as const) });
    expect(rows()).toHaveLength(200);
    expect(card()).toHaveTextContent("All 200 receipts are untouched");
    await user.click(screen.getByRole("button", { name: "Try changing one receipt" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "fail"));
    expect(statusesOfRows().filter((x) => x === "changed")).toHaveLength(1);
    expect(performance.now() - started).toBeLessThan(15_000);
  });
});

describe("Proof (plain): around the card", () => {
  it("has the large title, the plain lead and the info button", async () => {
    await proof();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Proof");
    expect(screen.getByText("Every step Wally takes is written down as a receipt. Check that nobody changed one.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "How is this checked?" }).length).toBeGreaterThan(0);
  });

  it("explains how it is checked in four plain parts, then points to the offline checker", async () => {
    const { user } = await proof();
    await user.click(screen.getAllByRole("button", { name: "How is this checked?" })[0]!);
    const sheet = await screen.findByRole("dialog", { name: "How is this checked?" });
    expect(sheet.querySelectorAll(".pf-how__part")).toHaveLength(4);
    expect(sheet).toHaveTextContent("Each receipt is locked to the one before it");
    expect(sheet).toHaveTextContent("Wally signs, and you sign your choices");
    expect(sheet).toHaveTextContent("Receipts cut off the end are noticed too");
    expect(sheet).toHaveTextContent("What it does not prove");
    expect(sheet).toHaveTextContent("It does not prove the shop delivered");
    expect(sheet).toHaveTextContent("Check it yourself: the offline checker runs in any browser with no network.");
    expect(within(sheet).getByRole("link", { name: "Open the offline checker" })).toHaveAttribute("href", "/verifier/");
    expect(sheet.textContent).not.toMatch(/\b(hash|engine|checkpoint|JSONL|byte)/i);
  });

  it("links to the offline checker and the evidence page, keeps the footer, and offers no save when the client has none", async () => {
    await proof();
    expect(screen.getByRole("link", { name: "Open the offline checker" })).toHaveAttribute("href", "/verifier/");
    expect(screen.getByRole("link", { name: "Why trust Wally?" })).toHaveAttribute("href", "#/evidence");
    expect(screen.queryByRole("button", { name: "Save a copy of the receipts" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export receipts" })).toBeNull();
    expect(screen.getByText("Prototype. Not affiliated with HKT, Tap & Go or Mastercard.")).toBeInTheDocument();
    expect(screen.getByText("The rail is SIMULATED.")).toBeInTheDocument();
  });

  it("saves the receipts as three files with plain names when the client can export", async () => {
    const exportLog = vi.fn(async () => ({ log: '{"seq":0}', publicKeys: { note: "demo keys", engine: ["did:key:z1"], delegator: "did:key:z2", agent: "did:key:z3" }, checkpoint: { log_id: "l", seq: 0, entry_hash: "a" } }));
    const { user } = await proof({ extra: () => ({ exportLog }) });
    await user.click(screen.getByRole("button", { name: "Save a copy of the receipts" }));
    const sheet = await screen.findByRole("dialog", { name: "Save the receipts" });
    expect(sheet).toHaveTextContent("Three files for the offline checker, one for each box on its page. They are your real receipts, never the changed copy.");
    await waitFor(() => expect(within(sheet).getAllByRole("link")).toHaveLength(3));
    expect(within(sheet).getByRole("link", { name: /Receipts file/ })).toHaveAttribute("download", "wally-receipts.jsonl");
    expect(within(sheet).getByRole("link", { name: /Public keys file/ })).toHaveAttribute("download", "wally-public-keys.json");
    expect(within(sheet).getByRole("link", { name: /Saved checkpoint file/ })).toHaveAttribute("download", "wally-checkpoint.json");
    expect(sheet.textContent).not.toMatch(/JSONL|JSON\)/);
  });

  it("says in plain words that saving did not work", async () => {
    const exportLog = vi.fn(async () => {
      throw new Error("nope");
    });
    const { user } = await proof({ extra: () => ({ exportLog }) });
    await user.click(screen.getByRole("button", { name: "Save a copy of the receipts" }));
    expect(await screen.findByText("Saving did not work. Try again.")).toBeInTheDocument();
  });

  it("names Mum's budget file in plain words when the export has one", async () => {
    const exportLog = async () => ({ log: "{}", publicKeys: { note: "x", engine: [], delegator: "d", agent: "a" }, checkpoint: null, parentCredential: { issuer: "did:key:z6MkMum" } });
    const { user } = await proof({ extra: () => ({ exportLog }) });
    await user.click(screen.getByRole("button", { name: "Save a copy of the receipts" }));
    const sheet = await screen.findByRole("dialog", { name: "Save the receipts" });
    await waitFor(() => expect(within(sheet).getAllByRole("link")).toHaveLength(4));
    expect(within(sheet).getByRole("link", { name: /Mum's budget file/ })).toHaveAttribute("download", "parent-credential.json");
    expect(sheet).toHaveTextContent("the offline checker cannot check this link");
    expect(sheet.textContent).not.toMatch(/credential|JSON/i);
  });

  it("states the demo shortcut honestly: the booth laptop, or this page", async () => {
    await proof({ extra: (api) => ({ kind: "http", info: async () => ({ ...(await api.info()), kind: "http", demoShortcut: "DEMO SHORTCUT" }) as ApiInfo }) });
    expect(screen.getByText("Demo shortcut: the booth laptop signs for you here. In a real version your signing key stays on your phone.")).toBeInTheDocument();
  });

  it("states the on-device demo shortcut", async () => {
    await proof({ extra: (api) => ({ info: async () => ({ ...(await api.info()), demoShortcut: "this page" }) as ApiInfo }) });
    expect(screen.getByText("Demo shortcut: this page holds every demo key, yours included. In a real version your key stays on your phone.")).toBeInTheDocument();
  });

  it("shows Wally when there is nothing to check, and checks nothing", async () => {
    window.location.hash = "#/proof";
    const verify = vi.fn(async () => bad(0, "SCHEMA"));
    mountBare(<ProofScreen />, emptyClient({ verify }));
    expect(await screen.findByText("Nothing to check yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Check/ })).toBeNull();
    await new Promise((r) => setTimeout(r, 40));
    expect(verify).not.toHaveBeenCalled();
    expect(document.querySelector(".pf-tl")).toBeNull();
  });

  it("speaks 繁 when chosen, with the language marked on the screen", async () => {
    const { user } = await proof({ locale: "zh-HK" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("證明");
    expect(card()).toHaveTextContent("全部 4 張收據都完好無缺");
    expect(card()).toHaveTextContent("剛剛已在這部手機檢查。");
    expect(rows()[1]).toHaveTextContent("第 2 張收據");
    expect(rows()[1]).toHaveTextContent("完好");
    expect(document.querySelector('[data-screen="proof"]')).toHaveAttribute("lang", "zh-HK");
    await user.click(screen.getByRole("button", { name: "試改動一張收據" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "fail"));
    expect(card()).toHaveTextContent("第 2 張收據被改動");
    expect(document.querySelector("[data-tampered-copy]")).toHaveTextContent("我們在副本中把第 2 張收據的購物車總額由 HK$259 改成 HK$359，檢查即時發現");
    expect(rows()[1]).toHaveTextContent("已被改動");
    expect(rows()[2]).toHaveTextContent("未檢查");
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
  });
});

describe("Proof (developer): the screen as it was", () => {
  it("shows the old card and checks only when asked: no timeline, no automatic check, the verifier link as before", async () => {
    developerMode();
    const { api, clock } = instantMock();
    await seed(api, clock, ["normal"]);
    const verify = vi.fn(() => api.verify());
    const { user } = await mountScreen(<ProofScreen />, delegate(api, { verify }), { hash: "#/proof" });
    await screen.findByRole("button", { name: "Verify receipts" });
    expect(card()).toHaveTextContent("Ready to check 4 receipts");
    expect(document.querySelector('[data-screen="proof"]')).not.toHaveAttribute("data-mode");
    expect(document.querySelector(".pf-tl")).toBeNull();
    expect(document.querySelector("[data-tampered-banner]")).toBeNull();
    await new Promise((r) => setTimeout(r, 40));
    expect(verify).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Verify receipts" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "pass"));
    expect(card()).toHaveTextContent("4 entries, all intact.");
    expect(screen.getByRole("link", { name: "Open the offline verifier" })).toHaveAttribute("href", "/verifier/");
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
