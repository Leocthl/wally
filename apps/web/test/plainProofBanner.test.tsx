// The changed copy must be impossible to miss. The booth shares the tamper demo with the next visitor, so a page can open
// while a changed copy is up. Proof (plain and developer) and Receipts then open with a banner as their first child: it
// says it is a copy and the originals are untouched, says what changed (with chipped amounts), and puts the original
// back in one tap. The changed receipt is tagged in words. With no copy up there is no banner.
import { act, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { LocalApiClient } from "../src/api/local/LocalApiClient";
import { m0SealRequest } from "../src/api/mock/presets";
import type { ApiClient } from "../src/api/types";
import { useBoothContext, type Booth } from "../src/hooks/useBooth";
import { ProofScreen } from "../src/screens/proof/ProofScreen";
import { ReceiptsScreen } from "../src/screens/proof/ReceiptsScreen";
import { bareFigures, numsWithoutChip } from "./helpers/figures";
import { developerMode } from "./helpers/devMode";
import { instantMock, mountScreen, seed } from "./helpers/proofHarness";

vi.setConfig({ testTimeout: 30_000 });

const TITLE = "You are looking at a changed copy of the receipts. The stored originals are untouched.";

interface Case {
  readonly name: string;
  readonly screen: "proof" | "receipts";
  readonly mode: "plain" | "developer";
  readonly element: ReactElement;
  readonly change: string;
}
const CASES: readonly Case[] = [
  { name: "Proof, plain", screen: "proof", mode: "plain", element: <ProofScreen />, change: "On receipt 2, the cart total went from HK$259 to HK$359." },
  { name: "Proof, developer", screen: "proof", mode: "developer", element: <ProofScreen />, change: "In the copy, the cart total of receipt #1 went from HK$259 to HK$359." },
  { name: "Receipts, plain", screen: "receipts", mode: "plain", element: <ReceiptsScreen />, change: "On receipt 2, the cart total went from HK$259 to HK$359." },
  { name: "Receipts, developer", screen: "receipts", mode: "developer", element: <ReceiptsScreen />, change: "In the copy, the cart total of receipt #1 went from HK$259 to HK$359." },
];

/** A page that opens while a changed copy is already up: the client's snapshot carries it. */
async function freshLoad(c: Case, opts: { readonly copy: boolean; readonly locale?: "en" | "zh-HK" } = { copy: true }) {
  const { api, clock } = instantMock();
  await seed(api, clock, ["normal"]);
  if (opts.copy) {
    await api.tamper();
    expect((await api.snapshot()).log.tampered).not.toBeNull();
  }
  if (c.mode === "developer") developerMode();
  const view = await mountScreen(c.element, api, { hash: `#/${c.screen}`, ...(opts.locale ? { locale: opts.locale } : {}) });
  const root = document.querySelector<HTMLElement>(`[data-screen="${c.screen}"]`)!;
  if (c.screen === "receipts") await waitFor(() => expect(document.querySelectorAll(".rc-row").length).toBeGreaterThan(0));
  return { ...view, api, root };
}

describe.each(CASES)("$name, opened while a changed copy is up", (c) => {
  it("opens with the banner as the first thing on the screen: a copy, the originals untouched, and what changed", async () => {
    const { root } = await freshLoad(c);
    const banner = root.firstElementChild as HTMLElement;
    expect(banner).toHaveAttribute("data-tampered-banner");
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner).toHaveTextContent(TITLE);
    expect(banner).toHaveTextContent(c.change);
    expect(banner.querySelector("svg")).not.toBeNull();
    const button = within(banner).getByRole("button", { name: "Restore the original" });
    expect(button).toBeEnabled();
    expect(banner.querySelectorAll('[data-prov="SIMULATED"][data-chip]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll("[data-tampered-banner]")).toHaveLength(1);
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
  });

  it("restores the original in one tap: the banner goes, the screen shows the stored receipts, and Proof checks again", async () => {
    const { user, root, api } = await freshLoad(c);
    await user.click(within(root).getByRole("button", { name: "Restore the original" }));
    await waitFor(() => expect(document.querySelector("[data-tampered-banner]")).toBeNull());
    expect((await api.getLog()).tampered).toBeNull();
    if (c.screen === "proof") {
      await waitFor(() => expect(document.querySelector(".pf-card")).toHaveAttribute("data-status", "pass"));
      expect(document.querySelector("[data-tampered-copy]")).toBeNull();
    } else {
      expect(document.querySelectorAll(".rc-row--flagged")).toHaveLength(0);
      expect(root).toHaveTextContent("HK$259");
      expect(root).not.toHaveTextContent("HK$359");
    }
  });

  it("shows no banner when no copy is up", async () => {
    const { root } = await freshLoad(c, { copy: false });
    expect(document.querySelector("[data-tampered-banner]")).toBeNull();
    expect(root.firstElementChild).not.toHaveAttribute("data-tampered-banner");
    expect(screen.queryByRole("button", { name: "Restore the original" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("speaks 繁 when chosen", async () => {
    const { root } = await freshLoad(c, { copy: true, locale: "zh-HK" });
    const banner = root.firstElementChild as HTMLElement;
    expect(banner).toHaveTextContent("你正在看收據的已改動副本。已儲存的原本收據原封不動。");
    expect(within(banner).getByRole("button", { name: "還原原本的收據" })).toBeInTheDocument();
  });
});

describe("the changed receipt is marked", () => {
  it.each(["plain", "developer"] as const)("Receipts (%s): the changed row is tinted and tagged Changed, shows the copy's amount, and its sheet says so", async (mode) => {
    const c = CASES.find((x) => x.screen === "receipts" && x.mode === mode)!;
    const { user } = await freshLoad(c);
    const flagged = document.querySelectorAll<HTMLElement>(".rc-row--flagged");
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toHaveTextContent("Changed");
    expect(flagged[0]).toHaveTextContent("HK$359");
    expect(flagged[0]!.querySelector(".rc-row__meta")).toHaveAttribute("data-seq", "1");
    await user.click(flagged[0]!.querySelector("button")!);
    const sheet = await screen.findByRole("dialog");
    expect(sheet.querySelector(".rc-changed")).toHaveTextContent("This receipt was changed in the copy you are looking at. The stored original is untouched.");
    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(document.querySelector<HTMLElement>(".rc-row:not(.rc-row--flagged) button")!);
    expect((await screen.findByRole("dialog")).querySelector(".rc-changed")).toBeNull();
  });

  it("Proof (plain): the timeline marks the changed receipt Changed and the ones after it Not checked", async () => {
    const c = CASES[0]!;
    await freshLoad(c);
    await waitFor(() => expect(document.querySelector(".pf-card")).toHaveAttribute("data-status", "fail"));
    const rows = [...document.querySelectorAll<HTMLElement>(".pf-tl__item")];
    expect(rows.map((r) => r.getAttribute("data-status"))).toEqual(["ok", "changed", "after", "after"]);
    expect(rows[1]).toHaveTextContent("Changed");
    expect(rows[2]).toHaveTextContent("Not checked");
  });

  it("Proof (developer): the chain strip marks the changed link", async () => {
    const c = CASES[1]!;
    const { user } = await freshLoad(c);
    await user.click(screen.getByRole("button", { name: "Verify receipts" }));
    await waitFor(() => expect(document.querySelector(".pf-card")).toHaveAttribute("data-status", "fail"));
    expect(document.querySelectorAll('[data-link="fail"]')).toHaveLength(1);
    expect(document.querySelector("[data-tampered-copy]")).toHaveTextContent("Your stored receipts are untouched.");
  });
});

describe("a copy made in this visit is flagged the same way", () => {
  it("Receipts shows the banner and the tag as soon as the copy is made, and loses both on restore", async () => {
    let booth!: Booth;
    function Probe(): null {
      booth = useBoothContext();
      return null;
    }
    const { api, clock } = instantMock();
    await seed(api, clock, ["normal"]);
    await mountScreen(<><ReceiptsScreen /><Probe /></>, api, { hash: "#/receipts" });
    await waitFor(() => expect(document.querySelectorAll(".rc-row")).toHaveLength(2)); // the budget sealed, and the purchase
    expect(document.querySelector("[data-tampered-banner]")).toBeNull();
    await act(async () => booth.tamper());
    expect(document.querySelector("[data-tampered-banner]")).not.toBeNull();
    expect(document.querySelectorAll(".rc-row--flagged")).toHaveLength(1);
    expect(document.querySelector(".rc-row--flagged")).toHaveTextContent("HK$359");
    await act(async () => booth.restore());
    expect(document.querySelector("[data-tampered-banner]")).toBeNull();
    expect(document.querySelector(".rc-screen")).toHaveTextContent("HK$259");
  });
});

describe("on the on-device client", () => {
  it("opens Receipts and Proof with the banner after a reload, and restores", async () => {
    const client = new LocalApiClient({ tickMs: null });
    try {
      await client.seal(m0SealRequest(new Date()));
      await client.runScenario("normal");
      await client.tamper();
      const view = await mountScreen(<ReceiptsScreen />, client as ApiClient, { hash: "#/receipts" });
      await waitFor(() => expect(document.querySelectorAll(".rc-row").length).toBeGreaterThanOrEqual(2));
      const root = document.querySelector<HTMLElement>('[data-screen="receipts"]')!;
      expect(root.firstElementChild).toHaveAttribute("data-tampered-banner");
      expect(document.querySelectorAll(".rc-row--flagged")).toHaveLength(1);
      await view.user.click(within(root).getByRole("button", { name: "Restore the original" }));
      await waitFor(() => expect(document.querySelector("[data-tampered-banner]")).toBeNull());
      expect((await client.getLog()).tampered).toBeNull();
    } finally {
      client.dispose();
    }
  });
});
