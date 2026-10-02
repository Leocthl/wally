// Cancel this budget (replaces the RevokeButton tests): hold to confirm with the same timing rules (early release
// cancels, Space or Enter hold, steps under reduced motion), then a dialog, then api.revoke. Plus the cards list.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    expect(screen.getAllByRole("link", { name: /Set up a new budget/ })[0]).toHaveAttribute("href", "#/seal");
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
