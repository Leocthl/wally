// #/receipts in plain mode: a row says its state and its receipt number (no hash, no #seq), the sheet's heading line says
// "Receipt 4 · time", a stop is worded like the Wally screen words it (no rule id), and everything technical (rule ids,
// comparators, the engine's sentence, hashes, JSON) sits behind ONE "Show the details". Developer mode keeps the old markup.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReceiptsScreen } from "../src/screens/proof/ReceiptsScreen";
import { bareFigures, numsWithoutChip } from "./helpers/figures";
import { developerMode } from "./helpers/devMode";
import { instantMock, mountScreen, seed } from "./helpers/proofHarness";

vi.setConfig({ testTimeout: 30_000 });

async function seeded(steps: Parameters<typeof seed>[2], opts?: Parameters<typeof mountScreen>[2]) {
  const { api, clock } = instantMock();
  await seed(api, clock, steps);
  const view = await mountScreen(<ReceiptsScreen />, api, opts);
  const entries = (await api.getLog()).entries;
  await waitFor(() => expect(document.querySelectorAll(".rc-row")).toHaveLength(entries.length));
  return { ...view, api, entries };
}

const rowButton = (seq: number): HTMLButtonElement => document.querySelector(`[data-seq="${seq}"]`)!.closest("button")!;

/** Text a person reads in an element, leaving out whatever sits inside a disclosure. */
function visibleText(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll("details").forEach((d) => d.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ");
}

const LEAKS: readonly (readonly [string, RegExp])[] = [
  ["rule id", /\bR\d{1,2}\b/],
  ["hash", /[0-9a-f]{8}/i],
  ["the word hash", /\bhash(es)?\b/i],
  ["engine", /\bengine\b/i],
  ["mandate", /\bmandate\b/i],
  ["packet", /\bpacket\b/i],
  ["mint", /\bmint(ed|s|ing)?\b/i],
  ["delegator", /\bdelegator\b/i],
  ["JSON", /\bjson\b/i],
  ["#4-style id", /#\d+/],
];

describe("Receipts (plain): the list", () => {
  it("says the state and the receipt number in each row, and keeps the hash and #seq out", async () => {
    const { entries } = await seeded(["normal", "flagged", "overflow"]);
    const r3 = entries.find((e) => e.kind === "DECISION" && e.payload.outcome === "DENY" && e.payload.explanation?.template_id === "R3.over_remaining")!;
    const row = rowButton(r3.seq);
    const meta = row.querySelector<HTMLElement>(".rc-row__meta")!;
    expect(meta).toHaveTextContent(`Stopped before paying · Receipt ${r3.seq + 1}`);
    expect(meta).toHaveAttribute("data-seq", String(r3.seq));
    expect(meta).toHaveAttribute("data-state", "stopped");
    expect(row.textContent).not.toContain(r3.entry_hash.slice(0, 8));
    expect(row.textContent).not.toContain("#");
    expect(row).toHaveTextContent("HK$550");
    for (const e of entries) expect(rowButton(e.seq).textContent, `receipt ${e.seq + 1}`).not.toMatch(/[0-9a-f]{8}/);
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
  });

  it("keeps the filters, the counts and the newest-first order", async () => {
    const { user, entries } = await seeded(["normal", "flagged", "unverified", "overflow"]);
    const metas = [...document.querySelectorAll<HTMLElement>(".rc-row__meta")];
    expect(metas.map((m) => Number(m.dataset["seq"]))).toEqual(entries.map((e) => e.seq).reverse());
    const group = screen.getByRole("radiogroup", { name: "Show" });
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual(["All7", "Approved1", "Stopped2", "Needs OK1", "Cards2"]);
    await user.click(within(group).getByRole("radio", { name: /Stopped/ }));
    expect([...document.querySelectorAll(".rc-row__meta")].map((m) => m.getAttribute("data-state"))).toEqual(["stopped", "stopped"]);
  });

  it("speaks 繁: the state and 第 N 張收據", async () => {
    const { entries } = await seeded(["normal", "flagged"], { locale: "zh-HK" });
    const stop = entries.find((e) => e.kind === "DECISION" && e.payload.outcome === "DENY")!;
    expect(rowButton(stop.seq).querySelector(".rc-row__meta")).toHaveTextContent(`付款前已攔截 · 第 ${stop.seq + 1} 張收據`);
  });
});

describe("Receipts (plain): a receipt's sheet", () => {
  it("heads the sheet with the receipt number and the time, without the hash", async () => {
    const { user, entries } = await seeded(["normal"]);
    const approved = entries.find((e) => e.kind === "DECISION")!;
    await user.click(rowButton(approved.seq));
    const sheet = await screen.findByRole("dialog", { name: "Approved" });
    const meta = sheet.querySelector(".rc-hero__meta")!;
    expect(meta).toHaveTextContent(/^Receipt 2\s*·\s*\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    expect(meta.textContent).not.toContain(approved.entry_hash.slice(0, 8));
    expect(meta.textContent).not.toContain("#");
  });

  it("words a stop the way the Wally screen words it: no rule id, with the figures chipped", async () => {
    const { user, entries } = await seeded(["normal", "overflow"]);
    const stop = entries.find((e) => e.kind === "DECISION" && e.payload.outcome === "DENY")!;
    await user.click(rowButton(stop.seq));
    const sheet = await screen.findByRole("dialog", { name: "Stopped before paying" });
    expect(sheet.querySelector(".rc-hero__summary")).toHaveTextContent("It costs HK$550 with shipping, but only HK$541 is left in your budget.");
    const r3 = sheet.querySelector('[data-rule="R3"]')!;
    expect(r3).toHaveTextContent("Fits the budget left");
    expect(r3).toHaveTextContent("Stopped here");
    expect(r3).toHaveTextContent("It costs HK$550 with shipping, but only HK$541 is left in your budget.");
    expect(visibleText(sheet)).not.toMatch(/\bR\d{1,2}\b/);
    expect(visibleText(sheet)).not.toContain("Stopped by R3");
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
  });

  it("words a question the same way", async () => {
    const { user, entries } = await seeded(["unverified"]);
    const asked = entries.find((e) => e.kind === "DECISION")!;
    await user.click(rowButton(asked.seq));
    const sheet = await screen.findByRole("dialog", { name: "Needs your OK" });
    expect(sheet.querySelector(".rc-hero__summary")).toHaveTextContent("Wally couldn't check this seller recently.");
    expect(visibleText(sheet)).not.toMatch(/\bR\d{1,2}\b/);
  });

  it("puts everything technical behind one Show the details, closed to begin with", async () => {
    const { user, entries } = await seeded(["normal", "overflow"]);
    const stop = entries.find((e) => e.kind === "DECISION" && e.payload.outcome === "DENY")!;
    await user.click(rowButton(stop.seq));
    const sheet = await screen.findByRole("dialog", { name: "Stopped before paying" });
    const disclosures = sheet.querySelectorAll("details");
    expect(disclosures).toHaveLength(1);
    expect(disclosures[0]).not.toHaveAttribute("open");
    expect(disclosures[0]!.querySelector("summary")).toHaveTextContent("Show the details");
    expect(within(sheet).queryByText("Raw entry")).toBeNull();
    expect(within(sheet).queryByText("Details")).toBeNull();
    const inside = disclosures[0]!;
    // What "Details" held before, plus the engine's own sentence and the receipt's facts, are all still there, one tap away.
    expect(inside).toHaveTextContent("Stopped by R3. Total HK$550 is over the HK$541 left.");
    expect([...inside.querySelectorAll(".rc-detail")].some((d) => /R3/.test(d.textContent ?? ""))).toBe(true);
    expect(inside.querySelector(".rc-details__judge")).toBeInTheDocument();
    expect(inside).toHaveTextContent(`Locked to receipt ${stop.seq} by its fingerprint ${stop.prev_hash.slice(0, 8)}.`);
    expect(inside).toHaveTextContent(`This is receipt ${stop.seq + 1}.`);
    // The raw receipt, with its JSON and entry kind, is developer mode only.
    expect(inside.querySelector("pre")).toBeNull();
    expect(inside.querySelector(".rc-raw")).toBeNull();
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
  });

  it("gives a receipt without a decision just its facts in the one disclosure, and never the card handle", async () => {
    const { user, entries } = await seeded(["normal"]);
    const minted = entries.find((e) => e.kind === "CARD_MINTED")!;
    if (minted.kind !== "CARD_MINTED") throw new Error("card");
    await user.click(rowButton(minted.seq));
    const sheet = await screen.findByRole("dialog", { name: "One-off card" });
    expect(sheet.querySelectorAll("details")).toHaveLength(1);
    expect(sheet.querySelector("details summary")).toHaveTextContent("Show the details");
    expect(sheet.querySelector("details")).toHaveTextContent(`This is receipt ${minted.seq + 1}.`);
    expect(sheet.querySelector("pre")).toBeNull();
    expect(sheet.textContent).not.toContain(minted.payload.handle);
    expect(sheet).toHaveTextContent("It works once.");
  });

  it("leaves no rule id, hash, engine, mandate, packet or mint outside the disclosure on any receipt", async () => {
    const steps = ["normal", "flagged", "unverified", "overflow", "injected", "off_category", "overshoot", "replay", "wrong_merchant", "drift", "REVOKE"] as const;
    const { user, entries } = await seeded([...steps]);
    expect(entries.length).toBeGreaterThan(12);
    for (const entry of entries) {
      await user.click(rowButton(entry.seq));
      const sheet = await screen.findByRole("dialog");
      const text = visibleText(sheet);
      for (const [name, pattern] of LEAKS) expect(text, `${name} on receipt ${entry.seq + 1} (${entry.kind}): ${text}`).not.toMatch(pattern);
      await user.click(within(sheet).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
  });

  it("opens the decision named in #/receipts?d=<id> on arrival, as before", async () => {
    const { api, clock } = instantMock();
    await seed(api, clock, ["unverified"]);
    const decision = (await api.getLog()).entries.find((e) => e.kind === "DECISION")!;
    if (decision.kind !== "DECISION") throw new Error("decision");
    await mountScreen(<ReceiptsScreen />, api, { hash: `#/receipts?d=${decision.payload.id}` });
    const sheet = await screen.findByRole("dialog", { name: "Needs your OK" });
    expect(sheet.querySelector('[data-rule="R9"]')).toHaveTextContent("Asked you");
    expect(sheet.querySelectorAll("details")).toHaveLength(1);
  });

  it("speaks 繁 in the sheet: the heading line and the one disclosure", async () => {
    const { user, entries } = await seeded(["normal"], { locale: "zh-HK" });
    const approved = entries.find((e) => e.kind === "DECISION")!;
    await user.click(rowButton(approved.seq));
    const sheet = await screen.findByRole("dialog", { name: "已批准" });
    expect(sheet.querySelector(".rc-hero__meta")).toHaveTextContent("第 2 張收據");
    expect(sheet.querySelector("details summary")).toHaveTextContent("顯示詳情");
  });
});

describe("Receipts (developer): the screens as they were", () => {
  it("keeps #seq and the hash in each row, the hash in the sheet, and the two disclosures", async () => {
    developerMode();
    const { user, entries } = await seeded(["normal", "overflow"]);
    const stop = entries.find((e) => e.kind === "DECISION" && e.payload.outcome === "DENY")!;
    const row = rowButton(stop.seq);
    expect(row).toHaveTextContent(`#${stop.seq}`);
    expect(row).toHaveTextContent(stop.entry_hash.slice(0, 8));
    await user.click(row);
    const sheet = await screen.findByRole("dialog", { name: "Stopped before paying" });
    expect(sheet).toHaveTextContent("Stopped by R3. Total HK$550 is over the HK$541 left.");
    expect(sheet.querySelector(".rc-hero__meta")).toHaveTextContent(stop.entry_hash.slice(0, 8));
    expect(sheet.querySelector('[data-disclosure="details"] summary')).toHaveTextContent("Details");
    expect(sheet.querySelector('[data-disclosure="raw"] summary')).toHaveTextContent("Raw entry");
    expect(sheet.querySelectorAll("details")).toHaveLength(2);
  });
});
