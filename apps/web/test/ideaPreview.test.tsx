// An idea on Home opens a preview before it spends: the drawing, the name, the shop, the price in HK$ with its SIMULATED chip and
// "From the demo shop", then "Ask Wally to buy this" and "Not now". Only the buy button runs the purchase; the booth's scenario
// cards are controls and still run at once.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IdeaPreviewSheet } from "../src/screens/home/IdeaPreviewSheet";
import { IDEAS } from "../src/screens/home/ideas";
import { bootApp } from "./helpers/app";
import { bareFigures, numsWithoutChip } from "./helpers/figures";

vi.setConfig({ testTimeout: 30_000 });

const card = (id: string) => document.querySelector<HTMLElement>(`main [data-idea="${id}"]`)!;
const decisions = async (h: Awaited<ReturnType<typeof bootApp>>) => (await h.api.snapshot()).log.entries.filter((e) => e.kind === "DECISION").length;

describe("the price on the card", () => {
  it("is the shop's price in HK$, for every idea shown", async () => {
    await bootApp("#/budget");
    expect(card("tee")).toHaveTextContent("HK$259");
    expect(card("socks")).toHaveTextContent("HK$120");
    expect(card("jacket")).toHaveTextContent("HK$550");
    expect(card("hoodie")).toHaveTextContent("HK$180");
  });

  it("is a figure with its chip, not a bare number", async () => {
    await bootApp("#/budget");
    const section = document.querySelector("[data-tour='ideas']")!;
    expect(numsWithoutChip(section)).toEqual([]);
    expect(bareFigures(section)).toEqual([]);
  });
});

describe("the preview", () => {
  it("opens on a tap and shows the drawing, name, shop, price with SIMULATED, and where it is from", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(card("tee"));
    const sheet = await screen.findByRole("dialog", { name: "Cotton tee" });
    expect(sheet.querySelector("svg[data-art='tee']")).not.toBeNull();
    expect(sheet.querySelector("svg[data-art='tee']")).toHaveAttribute("aria-hidden", "true");
    expect(within(sheet).getByText("Demo Apparel")).toBeInTheDocument();
    expect(within(sheet).getByText("From the demo shop")).toBeInTheDocument();
    expect(sheet.querySelector("[data-num]")).toHaveTextContent("HK$259");
    expect(sheet.querySelector("[data-chip]")).toHaveTextContent("SIMULATED");
    expect(within(sheet).getByRole("button", { name: "Ask Wally to buy this" })).toBeEnabled();
    expect(within(sheet).getByRole("button", { name: "Not now" })).toBeInTheDocument();
    expect(numsWithoutChip(sheet)).toEqual([]);
    expect(bareFigures(sheet)).toEqual([]);
  });

  it("says what shipping adds when the shop charges it", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(card("jacket"));
    const sheet = await screen.findByRole("dialog", { name: "Denim jacket" });
    expect(sheet.querySelector(".idea-sheet__price")).toHaveTextContent("HK$550");
    expect(sheet).toHaveTextContent("HK$520 plus HK$30 shipping");
    expect(within(sheet).getByText("Demo Streetwear")).toBeInTheDocument();
  });

  it("buys nothing until the buy button: Not now, the close button and Escape all leave the budget as it was", async () => {
    const h = await bootApp("#/budget");
    for (const leave of ["not-now", "close", "escape"] as const) {
      await h.user.click(card("tee"));
      const sheet = await screen.findByRole("dialog", { name: "Cotton tee" });
      if (leave === "not-now") await h.user.click(within(sheet).getByRole("button", { name: "Not now" }));
      else if (leave === "close") await h.user.click(within(sheet).getByRole("button", { name: "Close" }));
      else await h.user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(window.location.hash).toBe("#/budget");
      expect(await decisions(h)).toBe(0);
      expect((await h.api.snapshot()).packet?.spent_minor).toBe(0);
    }
  });

  it("buys with the buy button only, and then Wally's screen shows the result", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(card("socks"));
    await h.user.click(within(await screen.findByRole("dialog", { name: "Ankle socks" })).getByRole("button", { name: "Ask Wally to buy this" }));
    expect(window.location.hash).toBe("#/wally");
    await waitFor(async () => expect(await decisions(h)).toBe(1));
    expect(screen.queryByRole("dialog", { name: "Ankle socks" })).toBeNull();
  });

  it("does not let the buy button work while a run is in flight, so nothing is sent twice", async () => {
    const onBuy = vi.fn();
    render(<IdeaPreviewSheet idea={IDEAS[0]!} busy onClose={() => undefined} onBuy={onBuy} />);
    const buy = within(await screen.findByRole("dialog", { name: "Cotton tee" })).getByRole("button", { name: "Ask Wally to buy this" });
    expect(buy).toHaveAttribute("aria-disabled", "true");
    await userEvent.setup().click(buy);
    expect(onBuy).not.toHaveBeenCalled();
  });

  it("is closed, and draws nothing, when no idea is chosen", () => {
    render(<IdeaPreviewSheet idea={null} busy={false} onClose={() => undefined} onBuy={() => undefined} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("speaks 繁 in the sheet and keeps the shop and the figures", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(screen.getByRole("radio", { name: "繁體中文" }));
    await h.user.click(card("tee"));
    const sheet = await screen.findByRole("dialog", { name: "純棉T恤" });
    expect(within(sheet).getByRole("button", { name: "叫 Wally 買呢件" })).toBeInTheDocument();
    expect(within(sheet).getByText("來自示範商店")).toBeInTheDocument();
    expect(within(sheet).getByText("Demo Apparel")).toBeInTheDocument();
    expect(sheet.querySelector("[data-num]")).toHaveTextContent("HK$259");
  });
});

describe("the booth's scenario cards", () => {
  it("still run at once, with no preview", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(document.querySelector<HTMLElement>('[data-demo-disclosure] [data-scenario="normal"]')!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.hash).toBe("#/wally");
    await waitFor(async () => expect(await decisions(h)).toBe(1));
  });
});
