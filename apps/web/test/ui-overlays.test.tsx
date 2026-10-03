// Sheet, Dialog and Toast: modal semantics, focus moves in, Tab wraps, Escape and scrim close, focus returns, page
// scroll locks; toasts announce politely, plain ones leave on their own, ones with an action wait.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../src/ui/Button";
import { focusables } from "../src/ui/hooks/useFocusTrap";
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

  it("puts first focus on the control marked data-autofocus (a destructive confirm is never the first stop); Tab still wraps through both", async () => {
    render(
      <Dialog open onClose={() => undefined} role="alertdialog" title="Sure?" actions={<><Button variant="danger">Do it</Button><Button variant="ghost" data-autofocus>Not now</Button></>}>
        Really?
      </Dialog>,
    );
    const doIt = screen.getByRole("button", { name: "Do it" });
    const notNow = screen.getByRole("button", { name: "Not now" });
    expect(notNow).toHaveFocus();
    await userEvent.tab(); // from the last control round to the first
    expect(doIt).toHaveFocus();
    await userEvent.tab();
    expect(notNow).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(doIt).toHaveFocus();
  });

  it("falls back to the first control when the marked one cannot take focus", () => {
    render(
      <Dialog open onClose={() => undefined} title="Sure?" actions={<><Button>First</Button><button type="button" disabled data-autofocus>Second</button></>}>
        Really?
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
  });

  it("leaves a dialog without a mark as it was: first control first", () => {
    render(<Dialog open onClose={() => undefined} title="Sure?" actions={<><Button>First</Button><Button variant="ghost">Second</Button></>}>Really?</Dialog>);
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
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

describe("two sheets in a hand-over (the Ask sheet closes while another sheet opens)", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  function HandOver(): ReactElement {
    const [first, setFirst] = useState(true);
    const [second, setSecond] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setFirst(true)}>Open first</button>
        <Sheet open={first} onClose={() => setFirst(false)} title="First sheet">
          <button type="button" onClick={() => { setFirst(false); setSecond(true); }}>Hand over</button>
        </Sheet>
        <Sheet open={second} onClose={() => setSecond(false)} title="Second sheet">
          <button type="button">Inside second</button>
        </Sheet>
      </>
    );
  }

  it("keeps the page locked until the last sheet is gone, then gives back what was there before", async () => {
    document.body.style.overflow = "auto";
    render(<HandOver />);
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.click(screen.getByRole("button", { name: "Hand over" }));
    await screen.findByRole("dialog", { name: "Second sheet" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "First sheet" })).toBeNull());
    expect(document.body.style.overflow).toBe("hidden"); // the first sheet's exit must not unlock the page under the second
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.style.overflow).toBe("auto");
  });

  it("leaves focus in the new sheet, not on the opener behind it", async () => {
    render(<HandOver />);
    await userEvent.click(screen.getByRole("button", { name: "Hand over" }));
    const second = await screen.findByRole("dialog", { name: "Second sheet" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "First sheet" })).toBeNull());
    expect(second.contains(document.activeElement)).toBe(true);
  });
});

describe("the Tab wrap sees only what Tab can reach", () => {
  function Roving(): ReactElement {
    return (
      <Sheet open onClose={() => undefined} title="Roving">
        <button type="button">first</button>
        <div role="radiogroup" aria-label="cards">
          <button type="button" role="radio" aria-checked="true" tabIndex={0}>card one</button>
          <button type="button" role="radio" aria-checked="false" tabIndex={-1}>card two</button>
          <button type="button" role="radio" aria-checked="false" tabIndex={-1}>card three</button>
        </div>
        <details>
          <summary>More details</summary>
          <button type="button">hidden chip</button>
        </details>
      </Sheet>
    );
  }

  it("does not count roving buttons that Tab skips, nor the controls inside a closed disclosure, but does count the disclosure's summary", async () => {
    render(<Roving />);
    const dialog = screen.getByRole("dialog", { name: "Roving" });
    const reachable = focusables(dialog).map((el) => el.textContent?.trim() ?? el.getAttribute("aria-label"));
    expect(reachable).toEqual(expect.arrayContaining(["first", "card one", "More details"]));
    expect(reachable).not.toContain("card two");
    expect(reachable).not.toContain("card three");
    expect(reachable).not.toContain("hidden chip");
  });

  it("wraps from the last reachable control, which is the disclosure here", async () => {
    render(<Roving />);
    const dialog = screen.getByRole("dialog", { name: "Roving" });
    const items = focusables(dialog);
    const last = items[items.length - 1];
    last?.focus();
    expect(last?.tagName).toBe("SUMMARY");
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(items[0]);
  });
});
