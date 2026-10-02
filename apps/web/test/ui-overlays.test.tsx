// Sheet, Dialog and Toast: modal semantics, focus moves in, Tab wraps, Escape and scrim close, focus returns, page
// scroll locks; toasts announce politely, plain ones leave on their own, ones with an action wait.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../src/ui/Button";
import { Dialog, Sheet } from "../src/ui/Overlay";
import { TOAST_MS, ToastProvider, useToast } from "../src/ui/Toast";

function SheetDemo({ onClose }: { readonly onClose?: () => void }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Why?</button>
      <Sheet open={open} onClose={() => { onClose?.(); setOpen(false); }} title="Why Wally stopped" description="Fixed rules decided this" footer={<Button>OK</Button>}>
        <p>Over the budget</p>
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("opens as a labelled modal dialog, moves focus inside and locks page scroll", async () => {
    render(<SheetDemo />);
    await userEvent.click(screen.getByRole("button", { name: "Why?" }));
    const dialog = screen.getByRole("dialog", { name: "Why Wally stopped" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Fixed rules decided this");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("wraps Tab and Shift+Tab inside the sheet", async () => {
    render(<SheetDemo />);
    await userEvent.click(screen.getByRole("button", { name: "Why?" }));
    const close = screen.getByRole("button", { name: "Close" });
    const ok = screen.getByRole("button", { name: "OK" });
    expect(close).toHaveFocus();
    await userEvent.tab();
    expect(ok).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(ok).toHaveFocus();
  });

  it("closes on Escape and returns focus to the opener", async () => {
    const onClose = vi.fn();
    render(<SheetDemo onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "Why?" });
    await userEvent.click(opener);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes from the scrim and from the close button", async () => {
    const onClose = vi.fn();
    render(<SheetDemo onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Why?" }));
    await userEvent.click(document.querySelector(".w-scrim") as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Why?" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("Dialog", () => {
  it("can be an alertdialog with its body as the description", async () => {
    function Demo(): ReactElement {
      const [open, setOpen] = useState(true);
      return <Dialog open={open} onClose={() => setOpen(false)} role="alertdialog" title="Cancel this budget?" actions={<Button onClick={() => setOpen(false)}>Keep it</Button>}>Unused cards stop working.</Dialog>;
    }
    render(<Demo />);
    const d = screen.getByRole("alertdialog", { name: "Cancel this budget?" });
    expect(d).toHaveAccessibleDescription("Unused cards stop working.");
    expect(screen.getByRole("button", { name: "Keep it" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});

function ToastDemo({ withAction }: { readonly withAction: boolean }): ReactElement {
  const toast = useToast();
  return <button type="button" onClick={() => toast.show({ message: "New version ready", ...(withAction ? { action: { label: "Reload", onAction: () => document.body.setAttribute("data-reloaded", "yes") } } : {}) })}>Show</button>;
}

describe("Toast", () => {
  it("announces in a polite status region and leaves on its own", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<ToastProvider><ToastDemo withAction={false} /></ToastProvider>);
      await userEvent.click(screen.getByRole("button", { name: "Show" }));
      const region = screen.getByRole("status");
      expect(region).toHaveAttribute("aria-live", "polite");
      expect(region).toHaveTextContent("New version ready");
      act(() => vi.advanceTimersByTime(TOAST_MS + 10));
      expect(region).not.toHaveTextContent("New version ready");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a toast with an action until it is used", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<ToastProvider><ToastDemo withAction /></ToastProvider>);
      await userEvent.click(screen.getByRole("button", { name: "Show" }));
      act(() => vi.advanceTimersByTime(TOAST_MS * 3));
      await userEvent.click(screen.getByRole("button", { name: "Reload" }));
      expect(document.body.getAttribute("data-reloaded")).toBe("yes");
      expect(screen.getByRole("status")).not.toHaveTextContent("New version ready");
    } finally {
      vi.useRealTimers();
      document.body.removeAttribute("data-reloaded");
    }
  });
});
