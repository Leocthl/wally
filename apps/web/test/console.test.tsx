// Cancel this budget (replaces the RevokeButton tests): hold to confirm with the same timing rules (early release
// cancels, Space or Enter hold, steps under reduced motion), then a dialog, then api.revoke. Plus the cards list.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardRecord } from "../src/api/types";
import { HOLD_MS } from "../src/design/motion";
import { SIMULATED } from "../src/domain/provenance";
import { ProvenanceChip } from "../src/ui/Chip";
import { CancelBudget } from "../src/screens/console/CancelBudget";
import { CardsSection } from "../src/screens/console/CardsSection";
import { bootApp, go, press } from "./helpers/app";
import { bareFigures, numsWithoutChip } from "./helpers/figures";
import { setReducedMotion } from "./setup";

const button = () => screen.getByRole("button", { name: /hold to cancel this budget/i });
const dialog = () => screen.queryByRole("alertdialog", { name: "Cancel this budget?" });

describe("Cancel this budget: the hold", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing on a quick tap", () => {
    render(<CancelBudget disabled={false} onConfirm={() => undefined} />);
    fireEvent.pointerDown(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS - 1));
    fireEvent.pointerUp(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS * 2));
    expect(dialog()).toBeNull();
  });

  it("asks once after the full hold, and only the dialog's confirm cancels", () => {
    const onConfirm = vi.fn();
    render(<CancelBudget disabled={false} onConfirm={onConfirm} />);
    fireEvent.pointerDown(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS));
    expect(dialog()).not.toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()!).getByRole("button", { name: "Cancel budget" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("the release after the hold does not answer the dialog it opened (pointerdown starts the press, the dialog opens under the finger)", () => {
    const onConfirm = vi.fn();
    render(<CancelBudget disabled={false} onConfirm={onConfirm} />);
    fireEvent.pointerDown(button(), { pointerId: 3, pointerType: "touch" });
    act(() => void vi.advanceTimersByTime(HOLD_MS));
    const open = dialog()!;
    const keep = within(open).getByRole("button", { name: "Keep it" });
    const confirm = within(open).getByRole("button", { name: "Cancel budget" });
    // The thumb lifts: the pointer goes up over the dialog, and the touch screen sends its click at that spot.
    fireEvent.pointerUp(keep, { pointerId: 3, pointerType: "touch" });
    fireEvent.click(keep, { detail: 1 });
    fireEvent.click(confirm, { detail: 1 });
    fireEvent.click(document.querySelector(".w-scrim")!, { detail: 1 });
    act(() => void vi.advanceTimersByTime(1000));
    expect(dialog()).not.toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
    // A press of its own is an answer again.
    fireEvent.pointerDown(keep, { pointerId: 4, pointerType: "touch" });
    fireEvent.pointerUp(keep, { pointerId: 4, pointerType: "touch" });
    fireEvent.click(keep, { detail: 1 });
    act(() => void vi.advanceTimersByTime(1000));
    expect(dialog()).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("holding Enter past the hold does not keep clicking the dialog's focused button", () => {
    const onConfirm = vi.fn();
    render(<CancelBudget disabled={false} onConfirm={onConfirm} />);
    button().focus();
    fireEvent.keyDown(button(), { key: "Enter", code: "Enter" });
    act(() => void vi.advanceTimersByTime(HOLD_MS));
    const keep = within(dialog()!).getByRole("button", { name: "Keep it" });
    const confirm = within(dialog()!).getByRole("button", { name: "Cancel budget" });
    // Focus starts on the safe answer, so no key can cancel the budget by accident (see "where focus lands" below).
    expect(keep).toHaveFocus();
    // The key is still down: its repeats would each click the focused button. They are not an answer.
    for (let i = 0; i < 3; i += 1) expect(fireEvent.keyDown(keep, { key: "Enter", code: "Enter", repeat: true })).toBe(false);
    fireEvent.keyUp(keep, { key: "Enter", code: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
    // A fresh press of Enter on the focused button is a decision, and it is "Keep it".
    expect(fireEvent.keyDown(keep, { key: "Enter", code: "Enter" })).toBe(true);
    // Cancelling is a deliberate act of its own: a click on the confirm button.
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels when the pointer leaves before the hold completes", () => {
    render(<CancelBudget disabled={false} onConfirm={() => undefined} />);
    fireEvent.pointerDown(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS / 2));
    fireEvent.pointerLeave(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS));
    expect(dialog()).toBeNull();
  });

  it("ignores everything while disabled", () => {
    render(<CancelBudget disabled onConfirm={() => undefined} />);
    fireEvent.pointerDown(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS * 2));
    expect(dialog()).toBeNull();
  });

  it.each(["Enter", " "])("holds %j from the keyboard; early release cancels", (key) => {
    render(<CancelBudget disabled={false} onConfirm={() => undefined} />);
    fireEvent.keyDown(button(), { key });
    act(() => void vi.advanceTimersByTime(HOLD_MS / 2));
    fireEvent.keyUp(button(), { key });
    act(() => void vi.advanceTimersByTime(HOLD_MS));
    expect(dialog()).toBeNull();
    fireEvent.keyDown(button(), { key });
    act(() => void vi.advanceTimersByTime(HOLD_MS));
    expect(dialog()).not.toBeNull();
  });

  it("Keep it closes the question and a new hold can start", () => {
    const onConfirm = vi.fn();
    render(<CancelBudget disabled={false} onConfirm={onConfirm} />);
    fireEvent.pointerDown(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS));
    fireEvent.click(within(dialog()!).getByRole("button", { name: "Keep it" }));
    act(() => void vi.advanceTimersByTime(1000));
    expect(dialog()).toBeNull();
    expect(button()).toBeEnabled();
    fireEvent.pointerDown(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS));
    expect(dialog()).not.toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("is a real button described by its hint", () => {
    render(<CancelBudget disabled={false} onConfirm={() => undefined} />);
    expect(button().tagName).toBe("BUTTON");
    expect(button()).toHaveAccessibleDescription(/let go early and nothing happens/i);
    expect(button()).toHaveAttribute("data-motion", "full");
  });

  it("keeps the hold under reduced motion but fills in steps", () => {
    setReducedMotion(true);
    render(<CancelBudget disabled={false} onConfirm={() => undefined} />);
    expect(button()).toHaveAttribute("data-motion", "reduced");
    fireEvent.pointerDown(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS / 2));
    expect(Number(button().getAttribute("data-step"))).toBeGreaterThan(0);
    expect(dialog()).toBeNull();
    act(() => void vi.advanceTimersByTime(HOLD_MS / 2));
    expect(dialog()).not.toBeNull();
  });
});

describe("Cancel this budget: where focus lands when the question opens", () => {
  const confirmButton = () => within(dialog()!).getByRole("button", { name: "Cancel budget" });
  const keepButton = () => within(dialog()!).getByRole("button", { name: "Keep it" });

  /** Holds Enter on the hold button until the question opens, then lets go of the key: what a keyboard user does. */
  async function askByKeyboard(onConfirm: () => void): Promise<void> {
    render(<CancelBudget disabled={false} onConfirm={onConfirm} />);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      button().focus();
      fireEvent.keyDown(button(), { key: "Enter", code: "Enter" });
      act(() => void vi.advanceTimersByTime(HOLD_MS));
    } finally {
      vi.useRealTimers();
    }
    await screen.findByRole("alertdialog", { name: "Cancel this budget?" });
    fireEvent.keyUp(keepButton(), { key: "Enter", code: "Enter" });
  }

  it("is on Keep it, not on the button that cancels", async () => {
    await askByKeyboard(() => undefined);
    expect(keepButton()).toHaveFocus();
    expect(confirmButton()).not.toHaveFocus();
  });

  it("lets Enter on the opening focus close the question without cancelling, and puts focus back on the hold button", async () => {
    const onConfirm = vi.fn();
    await askByKeyboard(onConfirm);
    await userEvent.setup().keyboard("{Enter}");
    await waitFor(() => expect(dialog()).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(button()).toHaveFocus());
  });

  it("lets Space on the opening focus close the question without cancelling", async () => {
    const onConfirm = vi.fn();
    await askByKeyboard(onConfirm);
    await userEvent.setup().keyboard(" ");
    await waitFor(() => expect(dialog()).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("still closes on Escape without cancelling", async () => {
    const onConfirm = vi.fn();
    await askByKeyboard(onConfirm);
    await userEvent.setup().keyboard("{Escape}");
    await waitFor(() => expect(dialog()).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("keeps the cancelling button one Tab away in both directions, and it still cancels on a click", async () => {
    const onConfirm = vi.fn();
    await askByKeyboard(onConfirm);
    const user = userEvent.setup();
    await user.tab({ shift: true });
    expect(confirmButton()).toHaveFocus();
    await user.tab();
    expect(keepButton()).toHaveFocus();
    await user.tab(); // wraps from the last control to the first
    expect(confirmButton()).toHaveFocus();
    await user.tab({ shift: true });
    expect(keepButton()).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("opens on Keep it after a pointer hold too", async () => {
    render(<CancelBudget disabled={false} onConfirm={() => undefined} />);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fireEvent.pointerDown(button(), { pointerId: 5, pointerType: "touch" });
      act(() => void vi.advanceTimersByTime(HOLD_MS));
    } finally {
      vi.useRealTimers();
    }
    await screen.findByRole("alertdialog", { name: "Cancel this budget?" });
    expect(keepButton()).toHaveFocus();
  });
});

const card = (over: Partial<CardRecord>): CardRecord => ({
  id: "crd_1", decision_id: "dec_1", mandate_id: "mnd_1", handle: "h", last4: "4821", limit_minor: 25900, currency: "HKD",
  minted_at: "2026-10-03T02:00:00Z", expires_at: "2099-10-03T02:10:00Z", state: "ACTIVE", merchant_lock: "demo-shop.example", simulated: true, ...over,
});

describe("one-off cards", () => {
  it("shows a ready card as a card: last four, the exact amount, the shop, a countdown and SIMULATED", () => {
    const { container } = render(<CardsSection active={[card({})]} past={[]} />);
    const ticket = container.querySelector('.oc[data-card-state="ACTIVE"]')!;
    expect(ticket).toHaveTextContent("4821");
    expect(ticket).toHaveTextContent("HK$259");
    expect(ticket).toHaveTextContent("Works once, for this amount only");
    expect(ticket).toHaveTextContent("Only at demo-shop.example");
    expect(ticket).toHaveTextContent(/Ends in \d+:\d\d:\d\d|Ends in \d+:\d\d/);
    expect(ticket.querySelector(':scope > .fig-chip [data-prov="SIMULATED"]')).not.toBeNull();
    expect(bareFigures(container)).toEqual([]);
    expect(numsWithoutChip(container)).toEqual([]);
  });

  it("lists used, cancelled and expired cards with an icon and words, never colour alone", () => {
    // Inside the app the top bar's SIMULATED note covers these amounts; the same chip row stands in for it here.
    const { container } = render(
      <div data-chip-scope>
        <span className="chip-scope__chips"><ProvenanceChip prov={SIMULATED} /></span>
        <CardsSection active={[]} past={[card({ id: "a", state: "USED" }), card({ id: "b", state: "VOIDED" }), card({ id: "c", state: "EXPIRED" })]} />
      </div>,
    );
    for (const [state, word] of [["USED", "Used"], ["VOIDED", "Cancelled"], ["EXPIRED", "Expired"]] as const) {
      const row = container.querySelector(`[data-card-state="${state}"]`)!.closest("li")!;
      expect(row).toHaveTextContent(word);
      expect(row.querySelector("svg")).not.toBeNull();
    }
    expect(screen.getByText(/No cards right now/)).toBeInTheDocument();
    expect(numsWithoutChip(container)).toEqual([]);
  });

  it("renders nothing when the budget never had a card", () => {
    const { container } = render(<CardsSection active={[]} past={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Cancel this budget in the app", () => {
  it("Cancel the budget card: a card is made, the hold and the dialog revoke, the card stops working", async () => {
    const h = await bootApp();
    await press(h, "revoke");
    await waitFor(() => expect(document.querySelector('.oc[data-card-state="ACTIVE"]')).not.toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById("budget-console")));
    expect(window.location.hash).toBe("#/budget");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fireEvent.pointerDown(button());
      act(() => void vi.advanceTimersByTime(HOLD_MS));
    } finally {
      vi.useRealTimers();
    }
    await h.user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel budget" }));
    await waitFor(async () => expect((await h.api.snapshot()).packet?.status).toBe("REVOKED"));
    expect(await screen.findByText("This budget is cancelled")).toBeInTheDocument();
    expect(await screen.findByText(/Budget cancelled\. Unused cards stopped working\./)).toBeInTheDocument();
    expect(document.querySelector('.oc[data-card-state="ACTIVE"]')).toBeNull();
    expect(document.querySelector('[data-card-state="VOIDED"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: /hold to cancel/i })).toBeNull();
    expect(screen.getAllByRole("link", { name: /Start a new budget/ })[0]).toHaveAttribute("href", "#/seal");
  });

  it("Top up and Change the rules open Seal prefilled", async () => {
    await bootApp();
    expect(screen.getByRole("link", { name: /Top up budget/ })).toHaveAttribute("href", "#/seal?mode=topup");
    expect(screen.getByRole("link", { name: /Change the rules/ })).toHaveAttribute("href", "#/seal?mode=edit");
    await go("#/seal?mode=topup");
    expect(await screen.findByRole("heading", { name: "Top up your budget" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Amount/ })).toHaveValue("800");
  });
});
