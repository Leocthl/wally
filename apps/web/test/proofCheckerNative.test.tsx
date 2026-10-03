// The offline checker is a page of its own: the booth server and the static site serve it. The iOS and Android shells do
// not bundle it, so inside a shell its links opened a blank page with no way back (found on the iPhone 17 Simulator), and
// the receipts files that only feed it saved nothing. Proof leaves both out there, in plain mode and in developer mode, on
// the screen and in the how sheet.
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProofScreen } from "../src/screens/proof/ProofScreen";
import { developerMode } from "./helpers/devMode";
import { delegate, instantMock, mountScreen, seed } from "./helpers/proofHarness";

vi.setConfig({ testTimeout: 20_000 });

/** What the shell's bridge script puts on window: the one question the app asks is isNativePlatform(). */
function insideShell(): void {
  Reflect.set(window, "Capacitor", { isNativePlatform: () => true });
}

afterEach(() => {
  Reflect.deleteProperty(window, "Capacitor");
});

async function openProof(opts: { readonly shell: boolean; readonly developer: boolean }) {
  if (opts.shell) insideShell();
  if (opts.developer) developerMode();
  const { api, clock } = instantMock();
  await seed(api, clock, ["normal"]);
  // The on-device client offers an export; the mock does not, so this one does.
  const exportLog = vi.fn(async () => ({
    log: '{"seq":0}',
    publicKeys: { note: "demo keys", engine: ["did:key:z1"], delegator: "did:key:z2", agent: "did:key:z3" },
    checkpoint: { log_id: "l", seq: 0, entry_hash: "a" },
  }));
  const view = await mountScreen(<ProofScreen />, delegate(api, { exportLog }), { hash: "#/proof" });
  await screen.findByRole("link", { name: "Why trust Wally?" });
  return view;
}

const checkerLinks = (scope: HTMLElement | Document = document): HTMLElement[] =>
  within(scope as HTMLElement).queryAllByRole("link", { name: /offline (checker|verifier)/i });

async function openHowSheet(user: Awaited<ReturnType<typeof openProof>>["user"]): Promise<HTMLElement> {
  const [open] = screen.getAllByRole("button", { name: "How is this checked?" });
  await user.click(open!);
  return screen.findByRole("dialog");
}

describe.each([
  { mode: "plain", developer: false, row: "Open the offline checker", save: "Save a copy of the receipts" },
  { mode: "developer", developer: true, row: "Open the offline verifier", save: "Export receipts" },
])("Proof ($mode): the offline checker and the files for it", ({ developer, row, save }) => {
  it("shows the link on the screen and in the how sheet, and the save row, in a browser", async () => {
    const { user } = await openProof({ shell: false, developer });
    expect(screen.getByRole("link", { name: row })).toHaveAttribute("href", "/verifier/");
    expect(screen.getByRole("button", { name: save })).toBeInTheDocument();
    const sheet = await openHowSheet(user);
    expect(within(sheet).getByRole("link", { name: row })).toHaveAttribute("href", "/verifier/");
    expect(within(sheet).getByText(/Check it yourself/)).toBeInTheDocument();
  });

  it("leaves the link, the sentence about it and the save row out inside the iOS or Android shell", async () => {
    const { user } = await openProof({ shell: true, developer });
    await waitFor(() => expect(screen.getByRole("link", { name: "Why trust Wally?" })).toBeInTheDocument());
    expect(checkerLinks()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: save })).not.toBeInTheDocument();
    const sheet = await openHowSheet(user);
    expect(checkerLinks(sheet)).toHaveLength(0);
    expect(within(sheet).queryByText(/Check it yourself/)).not.toBeInTheDocument();
    expect(within(sheet).getByRole("heading", { name: /How is this checked\?/ })).toBeInTheDocument();
  });
});
