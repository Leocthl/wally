// Seal screen (DM1): the sentence beside editable compiled rule chips, Seal disabled while a chip is invalid.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { bootApp } from "./helpers/app";
import { bareFigures, numsWithoutChip } from "./helpers/figures";

vi.setConfig({ testTimeout: 20_000 });

const budgetInput = () => within(document.querySelector('[data-chip-kind="budget"]') as HTMLElement).getByRole("textbox");
const sealButton = () => screen.getByRole("button", { name: /Seal packet|Packet sealed/ });

describe("Seal screen", () => {
  it("shows the M0 sentence next to chips for budget, expiry, category and sellers", async () => {
    await bootApp("#/seal");
    expect(screen.getByRole("textbox", { name: /Your mandate, in plain words/ })).toHaveValue("HK$800 this month for clothes, verified sellers only");
    for (const kind of ["budget", "expiry", "category", "sellers"]) expect(document.querySelector(`[data-chip-kind="${kind}"]`), kind).not.toBeNull();
    expect(budgetInput()).toHaveValue("800");
  });

  it("starts sealed with the preset: the Seal button is spent until something changes", async () => {
    await bootApp("#/seal");
    await waitFor(() => expect(sealButton()).toBeDisabled());
    expect(sealButton()).toHaveTextContent("Packet sealed");
  });

  it("disables Seal while a chip is invalid, explains why, and recovers when it is fixed", async () => {
    const h = await bootApp("#/seal");
    await h.user.clear(budgetInput());
    expect(budgetInput()).toHaveAttribute("aria-invalid", "true");
    expect(sealButton()).toBeDisabled();
    expect(screen.getAllByText(/Fix the highlighted chip to seal/).length).toBeGreaterThan(0);
    expect(screen.getByRole("alert")).toHaveTextContent(/Enter an amount above zero/);
    await h.user.type(budgetInput(), "500");
    expect(budgetInput()).toHaveAttribute("aria-invalid", "false");
    expect(sealButton()).toBeEnabled();
  });

  it("seals the edited chips: the engine will enforce HK$500, not the sentence", async () => {
    const h = await bootApp("#/seal");
    await h.user.clear(budgetInput());
    await h.user.type(budgetInput(), "500");
    await h.user.click(sealButton());
    await waitFor(async () => expect((await h.api.snapshot()).packet?.budget_minor).toBe(50_000));
    expect((await h.api.snapshot()).mandate?.rules.budget.amount_minor).toBe(50_000);
    await waitFor(() => expect(sealButton()).toBeDisabled());
  });

  it("recompiles the chips when the sentence changes (M2: seven days, ask above HK$300)", async () => {
    const h = await bootApp("#/seal");
    const box = screen.getByRole("textbox", { name: /Your mandate, in plain words/ });
    await h.user.clear(box);
    await h.user.click(box);
    await h.user.paste("HK$800 for clothes over the next 7 days, verified sellers only; ask me above HK$300");
    expect(document.querySelector('[data-chip-kind="askAbove"]')).not.toBeNull();
    expect(within(document.querySelector('[data-chip-kind="expiry"]') as HTMLElement).getByRole("combobox")).toHaveValue("days");
    await h.user.click(sealButton());
    await waitFor(async () => expect((await h.api.snapshot()).mandate?.rules.per_purchase?.ask_above_minor).toBe(30_000));
  });

  it("marks a mandate with no category invalid", async () => {
    const h = await bootApp("#/seal");
    await h.user.click(screen.getByRole("checkbox", { name: /Clothes/ }));
    expect(document.querySelector('[data-chip-kind="category"]')).toHaveAttribute("data-valid", "false");
    expect(sealButton()).toBeDisabled();
  });

  it("lets a visitor relax the seller check, which the engine then reads", async () => {
    const h = await bootApp("#/seal");
    await h.user.click(screen.getByRole("checkbox", { name: /Verified sellers only/ }));
    await h.user.click(sealButton());
    await waitFor(async () => expect((await h.api.snapshot()).mandate?.rules.seller_check.require_capture).toBe(false));
  });

  it("previews the packet with its SIMULATED chip and wears a chip on every figure", async () => {
    const h = await bootApp("#/seal");
    await h.user.clear(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: "650" } });
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "HK$650 left of HK$650, SIMULATED");
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
  });
});
