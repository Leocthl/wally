// #/proof with the offline mock and fakes around it: Verify passes with the count, head and checkpoint; Try to tamper
// fails at the changed receipt with the verifier page's words, the code and what changed in the copy; Restore passes
// again; an unknown code still gets a safe sentence and its code; the HTTP client says the booth server checked; the
// how-it-works sheet, export (only when offered), links, footer, EN and 繁, and the honesty scans.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiInfo, VerifyOutcome } from "../src/api/types";
import { ProofScreen } from "../src/screens/proof/ProofScreen";
import { bareFigures, numsWithoutChip } from "./helpers/figures";
import { developerModeForFile } from "./helpers/devMode";
import { delegate, emptyClient, instantMock, mountBare, mountScreen, seed } from "./helpers/proofHarness";

vi.setConfig({ testTimeout: 20_000 });
// These are the developer screens: hashes, #seq, reason codes and raw entries. Plain mode has its own plain*.test files.
developerModeForFile();

async function proof(opts: { readonly locale?: "en" | "zh-HK"; readonly wrap?: (api: ReturnType<typeof instantMock>["api"]) => Parameters<typeof mountScreen>[1] } = {}) {
  const { api, clock } = instantMock();
  await seed(api, clock, ["normal"]);
  const client = opts.wrap ? opts.wrap(api) : api;
  const view = await mountScreen(<ProofScreen />, client, { hash: "#/proof", ...(opts.locale ? { locale: opts.locale } : {}) });
  await screen.findByRole("button", { name: /Verify receipts|驗證收據/ });
  return { ...view, api };
}

const card = (): HTMLElement => document.querySelector<HTMLElement>(".pf-card")!;

describe("Proof: verify, tamper, restore", () => {
  it("verifies on this device: entry count, head hash, checkpoint, and what the mock cannot check", async () => {
    const { user, api } = await proof();
    expect(card()).toHaveTextContent("Ready to check 4 receipts");
    await user.click(screen.getByRole("button", { name: "Verify receipts" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "pass"));
    const head = (await api.getLog()).head!;
    expect(card()).toHaveTextContent("Receipts verified.");
    expect(card()).toHaveTextContent("4 entries, all intact.");
    expect(card().querySelector(".pf-card__where")).toHaveTextContent("Checked on this device.");
    expect(card()).toHaveTextContent(`#${head.seq} ${head.entry_hash.slice(0, 8)}`);
    expect(card().querySelector('[data-checkpoint="match"]')).toHaveTextContent("matches the saved checkpoint");
    expect(card()).toHaveTextContent("Not checked in this mode engine signatures, your signatures");
    expect(document.querySelectorAll('[data-link="ok"]')).toHaveLength(4);
  });

  it("Try to tamper fails at the changed receipt with the reason, the code and what changed; Restore passes again", async () => {
    const { user } = await proof();
    await user.click(screen.getByRole("button", { name: "Try to tamper" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "fail"));
    expect(card()).toHaveTextContent("Broken at receipt #1");
    expect(card()).toHaveTextContent("The content of this entry changed after it was written.");
    expect(card().querySelector("[data-reason]")).toHaveTextContent("PAYLOAD_HASH");
    expect(card().querySelector("[data-changed]")).toHaveTextContent("In the copy, the cart total of receipt #1 went from HK$259 to HK$359.");
    expect(document.querySelector("[data-tampered-copy]")).toHaveTextContent("Your stored receipts are untouched.");
    expect(document.querySelector('[data-link="fail"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-link="after"]')).toHaveLength(2);
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "pass"));
    expect(document.querySelector("[data-tampered-copy]")).toBeNull();
    expect(screen.getByRole("button", { name: "Try to tamper" })).toBeEnabled();
  });

  it("says something safe, with the code, for a failure code this screen does not know", async () => {
    const unknown = { result: { ok: false, failedSeq: 2, reason: "SOMETHING_NEW" }, checked: ["SCHEMA", "SOMETHING_NEW"], skipped: [], at: "2026-10-03T02:00:00Z" } as unknown as VerifyOutcome;
    const { user } = await proof({ wrap: (api) => delegate(api, { verify: async () => unknown }) });
    await user.click(screen.getByRole("button", { name: "Verify receipts" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "fail"));
    expect(card()).toHaveTextContent("Broken at receipt #2");
    expect(card()).toHaveTextContent("This receipt failed a check this screen does not know yet.");
    expect(card().querySelector("[data-reason]")).toHaveTextContent("SOMETHING_NEW");
    expect(card()).toHaveTextContent("Checked format, SOMETHING_NEW");
  });

  it("with the booth server, says the server checked and shows the demo-key shortcut", async () => {
    const shortcut = "DEMO SHORTCUT: this server holds the delegator's throwaway key.";
    const { user } = await proof({ wrap: (api) => delegate(api, { kind: "http", info: async () => ({ ...(await api.info()), kind: "http", demoShortcut: shortcut }) as ApiInfo }) });
    await user.click(screen.getByRole("button", { name: "Verify receipts" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "pass"));
    expect(card()).toHaveTextContent("Checked by the booth server.");
    expect(card()).not.toHaveTextContent("Checked on this device.");
    expect(screen.getByText(/the booth server holds your demo key and signs for you/)).toBeInTheDocument();
  });
});

describe("Proof: around the card", () => {
  it("explains how it is checked, including what it does not prove", async () => {
    const { user } = await proof();
    await user.click(screen.getAllByRole("button", { name: "How is this checked?" })[0]!);
    const sheet = await screen.findByRole("dialog", { name: "How is this checked?" });
    expect(sheet).toHaveTextContent("What it does not prove");
    expect(sheet).toHaveTextContent("It does not prove the shop delivered");
    expect(within(sheet).getByRole("link", { name: "Open the offline verifier" })).toHaveAttribute("href", "/verifier/");
  });

  it("links to the verifier and the evidence page, keeps the footer, and hides export when the client has none", async () => {
    await proof();
    expect(screen.getByRole("link", { name: "Open the offline verifier" })).toHaveAttribute("href", "/verifier/");
    expect(screen.getByRole("link", { name: "Why trust Wally?" })).toHaveAttribute("href", "#/evidence");
    expect(screen.queryByRole("button", { name: "Export receipts" })).toBeNull();
    expect(screen.getByText("Prototype. Not affiliated with HKT, Tap & Go or Mastercard.")).toBeInTheDocument();
    expect(screen.getByText("The rail is SIMULATED.")).toBeInTheDocument();
  });

  it("offers three verifier files when the client can export", async () => {
    const exportLog = vi.fn(async () => ({ log: '{"seq":0}', publicKeys: { note: "demo keys", engine: ["did:key:z1"], delegator: "did:key:z2", agent: "did:key:z3" }, checkpoint: { log_id: "l", seq: 0, entry_hash: "a" } }));
    const { user } = await proof({ wrap: (api) => delegate(api, { exportLog }) });
    await user.click(screen.getByRole("button", { name: "Export receipts" }));
    const sheet = await screen.findByRole("dialog", { name: "Export for the offline verifier" });
    await waitFor(() => expect(within(sheet).getAllByRole("link")).toHaveLength(3));
    expect(within(sheet).getByRole("link", { name: /Receipts \(log, JSONL\)/ })).toHaveAttribute("download", "wally-receipts.jsonl");
    expect(exportLog).toHaveBeenCalledTimes(1);
  });

  it("shows Wally when there is nothing to check", async () => {
    window.location.hash = "#/proof";
    mountBare(<ProofScreen />, emptyClient());
    expect(await screen.findByText("Nothing to check yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify receipts" })).toBeNull();
  });

  it("speaks 繁 when chosen", async () => {
    const { user } = await proof({ locale: "zh-HK" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("證明");
    await user.click(screen.getByRole("button", { name: "驗證收據" }));
    await waitFor(() => expect(card()).toHaveTextContent("收據已驗證。"));
    expect(card()).toHaveTextContent("已在此裝置驗證。");
    expect(document.querySelector('[data-screen="proof"]')).toHaveAttribute("lang", "zh-HK");
  });
});
