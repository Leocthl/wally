// #/receipts as a visitor uses it: rows grouped by day with state, #seq and hash, filter chips with counts, a detail
// sheet with the plain summary, money lines, checks in words, Open in Wally and the raw entry; the ?d= deep link; the
// empty state; EN and 繁; and the "no number without a chip" scans with the sheet open.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReceiptsScreen } from "../src/screens/proof/ReceiptsScreen";
import { bareFigures, numsWithoutChip } from "./helpers/figures";
import { emptyClient, instantMock, mountBare, mountScreen, seed } from "./helpers/proofHarness";

vi.setConfig({ testTimeout: 20_000 });

async function seeded(steps: Parameters<typeof seed>[2], opts?: Parameters<typeof mountScreen>[2]) {
  const { api, clock } = instantMock();
  await seed(api, clock, steps);
  const view = await mountScreen(<ReceiptsScreen />, api, opts);
  const entries = (await api.getLog()).entries;
  await waitFor(() => expect(document.querySelectorAll(".rc-row")).toHaveLength(entries.length));
  return { ...view, api, entries };
}

const rowButton = (seq: number): HTMLButtonElement => document.querySelector(`[data-seq="${seq}"]`)!.closest("button")!;

describe("Receipts list", () => {
  it("shows one row per signed entry, newest first, with the state, #seq, hash prefix, amount and time", async () => {
    const { entries } = await seeded(["normal", "flagged", "overflow"]);
    const metas = [...document.querySelectorAll<HTMLElement>(".rc-row__meta")];
    expect(metas.map((m) => Number(m.dataset["seq"]))).toEqual(entries.map((e) => e.seq).reverse());
    const r3 = entries.find((e) => e.kind === "DECISION" && e.payload.outcome === "DENY" && e.payload.explanation?.template_id === "R3.over_remaining")!;
    const row = rowButton(r3.seq);
    expect(row).toHaveTextContent("Stopped before paying");
    expect(row).toHaveTextContent(`#${r3.seq}`);
    expect(row).toHaveTextContent(r3.entry_hash.slice(0, 8));
    expect(row).toHaveTextContent("HK$550");
    expect(screen.getByRole("heading", { level: 2, name: /Today|Yesterday|\w{3}/ })).toBeInTheDocument();
    const days = document.querySelectorAll(".rc-day");
    expect(document.querySelectorAll('.rc-day .chip-scope__chips [data-prov="SIMULATED"]')).toHaveLength(days.length);
    expect(row).not.toHaveTextContent("(SIMULATED)");
  });

  it("filters with chips that show counts, one choice at a time, with arrow keys", async () => {
    const { user } = await seeded(["normal", "flagged", "unverified", "overflow"]);
    const group = screen.getByRole("radiogroup", { name: "Show" });
    const radios = within(group).getAllByRole("radio");
    // Sealed rules, the approval, its card and the charge, then a stop, an escalation and a stop.
    expect(radios.map((r) => r.textContent)).toEqual(["All7", "Approved1", "Stopped2", "Needs OK1", "Cards2"]);
    await user.click(within(group).getByRole("radio", { name: /Stopped/ }));
    expect(within(group).getByRole("radio", { name: /Stopped/ })).toHaveAttribute("aria-checked", "true");
    expect([...document.querySelectorAll(".rc-row__meta")].map((m) => m.getAttribute("data-state"))).toEqual(["stopped", "stopped"]);
    await user.keyboard("{ArrowRight}");
    expect(within(group).getByRole("radio", { name: /Needs OK/ })).toHaveFocus();
    expect([...document.querySelectorAll(".rc-row__meta")].map((m) => m.getAttribute("data-state"))).toEqual(["needsOk"]);
    await user.click(within(group).getByRole("radio", { name: /Cards/ }));
    expect(document.querySelectorAll(".rc-row")).toHaveLength(2);
  });

  it("opens a stop's sheet: the rule template sentence, money lines, checks in words, Open in Wally and the raw entry", async () => {
    const { user, entries } = await seeded(["normal", "overflow"]);
    const stop = entries.find((e) => e.kind === "DECISION" && e.payload.outcome === "DENY")!;
    if (stop.kind !== "DECISION") throw new Error("decision");
    await user.click(rowButton(stop.seq));
    const sheet = await screen.findByRole("dialog", { name: "Stopped before paying" });
    expect(sheet).toHaveTextContent("Stopped by R3. Total HK$550 is over the HK$541 left.");
    expect(sheet).toHaveTextContent(/Subtotal\s*HK\$520/);
    expect(sheet).toHaveTextContent(/Shipping\s*HK\$30/);
    expect(sheet).toHaveTextContent(/Total\s*HK\$550/);
    const r3 = sheet.querySelector('[data-rule="R3"]')!;
    expect(r3).toHaveTextContent("Fits the budget left");
    expect(r3).toHaveTextContent("Stopped here");
    expect(sheet.querySelector('[data-rule="R1"]')).toHaveTextContent("Passed");
    expect(within(sheet).getByRole("link", { name: /Open in Wally/ })).toHaveAttribute("href", `#/wally?d=${stop.payload.id}`);
    expect(window.location.hash).toBe(`#/receipts?d=${stop.payload.id}`);
    expect(sheet.querySelector('[data-disclosure="raw"]')).toHaveTextContent(stop.entry_hash);
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.hash).toBe("#/receipts");
  });

  it("hides the card handle in the raw entry and says the card works once", async () => {
    const { user, entries } = await seeded(["normal"]);
    const minted = entries.find((e) => e.kind === "CARD_MINTED")!;
    if (minted.kind !== "CARD_MINTED") throw new Error("card");
    await user.click(rowButton(minted.seq));
    const sheet = await screen.findByRole("dialog", { name: "One-off card" });
    expect(sheet).toHaveTextContent("It works once.");
    expect(sheet.querySelector("pre")?.textContent).toContain('"handle": "(hidden)"');
    expect(sheet.textContent).not.toContain(minted.payload.handle);
  });

  it("opens the decision named in #/receipts?d=<id> on arrival", async () => {
    const { api, clock } = instantMock();
    await seed(api, clock, ["unverified"]);
    const decision = (await api.getLog()).entries.find((e) => e.kind === "DECISION")!;
    if (decision.kind !== "DECISION") throw new Error("decision");
    await mountScreen(<ReceiptsScreen />, api, { hash: `#/receipts?d=${decision.payload.id}` });
    const sheet = await screen.findByRole("dialog", { name: "Needs your OK" });
    expect(sheet).toHaveTextContent("Escalated by R9. No record, not proof of safety.");
    expect(sheet.querySelector('[data-rule="R9"]')).toHaveTextContent("Asked you");
  });

  it("shows Wally and a plain line when there is nothing yet", async () => {
    window.location.hash = "#/receipts";
    mountBare(<ReceiptsScreen />, emptyClient());
    expect(await screen.findByText("No receipts yet")).toBeInTheDocument();
    expect(screen.getByText(/its signed receipt shows up here/)).toBeInTheDocument();
    expect(document.querySelectorAll(".rc-row")).toHaveLength(0);
  });

  it("speaks 繁 when chosen: title, chips and states, all marked zh-HK", async () => {
    await seeded(["normal", "flagged"], { locale: "zh-HK" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("收據");
    expect(screen.getByRole("radio", { name: /已攔截/ })).toBeInTheDocument();
    expect(document.querySelector('[data-state="stopped"]')).toHaveTextContent("付款前已攔截");
    expect(document.querySelector('[data-screen="receipts"]')).toHaveAttribute("lang", "zh-HK");
  });
});
