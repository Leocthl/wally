// The offline checker is a page of its own: the booth server and the static site serve it. The iOS and Android shells do
// not bundle it, so inside a shell its links opened a blank page with no way back (found on the iPhone 17 Simulator).
// Proof leaves those links out there, in plain mode and in developer mode, on the screen and in the how sheet.
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProofScreen } from "../src/screens/proof/ProofScreen";
import { developerMode } from "./helpers/devMode";
import { instantMock, mountScreen, seed } from "./helpers/proofHarness";

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
  const view = await mountScreen(<ProofScreen />, api, { hash: "#/proof" });
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
  { mode: "plain", developer: false, row: "Open the offline checker" },
  { mode: "developer", developer: true, row: "Open the offline verifier" },
])("Proof ($mode): the offline checker link", ({ developer, row }) => {
  it("is on the screen and in the how sheet in a browser, pointing at /verifier/", async () => {
    const { user } = await openProof({ shell: false, developer });
    expect(screen.getByRole("link", { name: row })).toHaveAttribute("href", "/verifier/");
    const sheet = await openHowSheet(user);
    expect(within(sheet).getByRole("link", { name: row })).toHaveAttribute("href", "/verifier/");
    expect(within(sheet).getByText(/Check it yourself/)).toBeInTheDocument();
  });

  it("is left out inside the iOS or Android shell, where the page does not exist", async () => {
    const { user } = await openProof({ shell: true, developer });
    await waitFor(() => expect(screen.getByRole("link", { name: "Why trust Wally?" })).toBeInTheDocument());
    expect(checkerLinks()).toHaveLength(0);
    const sheet = await openHowSheet(user);
    expect(checkerLinks(sheet)).toHaveLength(0);
    expect(within(sheet).queryByText(/Check it yourself/)).not.toBeInTheDocument();
    expect(within(sheet).getByRole("heading", { name: /How is this checked\?/ })).toBeInTheDocument();
  });
});
