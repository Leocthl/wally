// A purchase has one receipt number, and it is the number of the receipt its row opens. A bought item is three receipts (the
// decision, the one-off card, the charge); its row says "Paid", opens the charge and so says the charge's number: the "Receipt N"
// its sheet shows, the one Proof's timeline gives that receipt and the one Home's Recent shows. The steps under the row keep
// their own numbers, and while the tamper demo's changed copy is up the row opens the changed receipt and says that one's number.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReceiptsScreen } from "../src/screens/proof/ReceiptsScreen";
import { bootApp, go, press } from "./helpers/app";
import { instantMock, mountScreen, seed } from "./helpers/proofHarness";

vi.setConfig({ testTimeout: 40_000 });

/** The N of the first "Receipt N" (or "第 N 張收據") in an element's text. */
function receiptNo(el: Element | null | undefined): number {
  const text = el?.textContent ?? "";
  const found = /Receipt (\d+)|第 (\d+) 張收據/.exec(text);
  if (found === null) throw new Error(`no receipt number in "${text}"`);
  return Number(found[1] ?? found[2]);
}

const sheetNo = (sheet: HTMLElement): number => receiptNo(sheet.querySelector(".rc-hero__meta"));

async function closeSheet(user: Awaited<ReturnType<typeof bootApp>>["user"], sheet: HTMLElement): Promise<void> {
  await user.click(within(sheet).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

describe("a purchase row says the number of the receipt it opens", () => {
  it("is one number on Home, in the Receipts list, in the sheet the row opens and in Proof's timeline, and the steps keep their own", async () => {
    const h = await bootApp("#/budget");
    await press(h, "normal");
    const entries = (await h.api.getLog()).entries;
    expect(entries.map((e) => e.kind)).toEqual(["MANDATE_SEALED", "DECISION", "CARD_MINTED", "CARD_EVENT"]);
    const charge = entries[3]!;

    // Home's Recent: where it ended up, and the number of the receipt that says so.
    await go("#/budget");
    const recent = within(screen.getByRole("list", { name: "Recent" })).getAllByRole("link")[0]!;
    expect(recent).toHaveTextContent("Paid · Receipt 4");

    // The Receipts list: the same words, and the row opens that very receipt.
    await go("#/receipts");
    const meta = document.querySelector<HTMLElement>(".rc-purchase .rc-row__meta")!;
    expect(meta).toHaveTextContent("Paid · Receipt 4");
    expect(meta).toHaveAttribute("data-seq", String(charge.seq));
    const rowNo = receiptNo(meta);
    expect(rowNo).toBe(charge.seq + 1);
    expect(receiptNo(recent)).toBe(rowNo);
    await h.user.click(meta.closest("button")!);
    const sheet = await screen.findByRole("dialog", { name: "Paid" });
    expect(sheetNo(sheet)).toBe(rowNo);
    await closeSheet(h.user, sheet);

    // The steps behind the row keep their own numbers (the decision 2, the card 3, the charge 4), and each opens a sheet that says its own.
    const purchase = document.querySelector<HTMLElement>(".rc-purchase")!;
    await h.user.click(purchase.querySelector<HTMLButtonElement>("[data-steps-toggle]")!);
    const steps = [...purchase.querySelectorAll<HTMLElement>(".rc-step")];
    expect(steps.map((s) => receiptNo(s.querySelector(".rc-step__meta")))).toEqual([2, 3, 4]);
    for (const step of steps) {
      await h.user.click(step);
      const stepSheet = await screen.findByRole("dialog");
      expect(sheetNo(stepSheet)).toBe(receiptNo(step.querySelector(".rc-step__meta")));
      await closeSheet(h.user, stepSheet);
    }

    // Proof's timeline gives that receipt (the charge) the same number.
    await go("#/proof");
    const proofRow = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(`.pf-tl__item[data-seq="${charge.seq}"]`);
      if (found === null) throw new Error("no timeline row yet");
      return found;
    });
    expect(proofRow.querySelector(".pf-tl__title")).toHaveTextContent("Charged");
    expect(receiptNo(proofRow.querySelector(".pf-tl__sub"))).toBe(rowNo);
  });

  it("keeps Wally's details to the decision's own receipt (2), the one the link under it opens", async () => {
    const h = await bootApp("#/budget");
    await press(h, "normal");
    await h.user.click(await screen.findByRole("button", { name: "Why was this approved?" }));
    const why = await screen.findByRole("dialog");
    await h.user.click(within(why).getByText("Details for nerds"));
    expect(why.querySelector(".run-nerd-ids")).toHaveTextContent(/Receipt\s*2/);
    const href = within(why).getByRole("link", { name: /See the receipt/ }).getAttribute("href")!;
    await h.user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await go(href);
    const sheet = await screen.findByRole("dialog", { name: "Approved" });
    expect(sheetNo(sheet)).toBe(2);
  });

  it("holds for every row of a longer list: a stop, a bought item, a question answered yes, a question left open", async () => {
    const { api, clock } = instantMock();
    await seed(api, clock, ["flagged", "normal", "unverified"]);
    const asked = (await api.getLog()).entries.filter((e) => e.kind === "DECISION").at(-1)!;
    if (asked.kind !== "DECISION") throw new Error("decision");
    await api.answerEscalation({ decisionId: asked.payload.id, choice: "APPROVE" });
    await api.runScenario("unverified");
    const { user } = await mountScreen(<ReceiptsScreen />, api);
    await waitFor(() => expect(document.querySelectorAll(".rc-row .rc-row__meta").length).toBeGreaterThan(4));
    const metas = [...document.querySelectorAll<HTMLElement>(".rc-row .rc-row__meta")];
    // The budget sealed, the stop, two bought items and the question still waiting for you.
    expect(metas.map((m) => m.getAttribute("data-state"))).toEqual(["needsOk", "paid", "paid", "stopped", "sealed"]);
    for (const meta of metas) {
      const shown = receiptNo(meta);
      await user.click(meta.closest("button")!);
      const sheet = await screen.findByRole("dialog");
      expect(sheetNo(sheet), `the sheet behind "${meta.textContent}"`).toBe(shown);
      await closeSheet(user, sheet);
    }
  });

  it("says the number of the changed receipt while the tamper demo's changed copy is up: the one the row opens", async () => {
    const { api, clock } = instantMock();
    await seed(api, clock, ["normal"]);
    await api.tamper();
    const changed = (await api.snapshot()).log.tampered!.seq;
    const { user } = await mountScreen(<ReceiptsScreen />, api);
    await waitFor(() => expect(document.querySelector(".rc-purchase")).not.toBeNull());
    const meta = document.querySelector<HTMLElement>(".rc-purchase .rc-row__meta")!;
    expect(meta).toHaveAttribute("data-seq", String(changed));
    expect(meta).toHaveTextContent(`Paid · Receipt ${changed + 1} · Changed`);
    await user.click(meta.closest("button")!);
    const sheet = await screen.findByRole("dialog", { name: "Approved" });
    expect(sheetNo(sheet)).toBe(changed + 1);
    expect(sheet.querySelector(".rc-changed")).not.toBeNull();
  });

  it("reads the same in 繁: 第 4 張收據 on the row and in its sheet", async () => {
    const { api, clock } = instantMock();
    await seed(api, clock, ["normal"]);
    const { user } = await mountScreen(<ReceiptsScreen />, api, { locale: "zh-HK" });
    await waitFor(() => expect(document.querySelector(".rc-purchase")).not.toBeNull());
    const meta = document.querySelector<HTMLElement>(".rc-purchase .rc-row__meta")!;
    expect(meta).toHaveTextContent("已付款 · 第 4 張收據");
    await user.click(meta.closest("button")!);
    const sheet = await screen.findByRole("dialog", { name: "已付款" });
    expect(sheet.querySelector(".rc-hero__meta")).toHaveTextContent("第 4 張收據");
  });
});
