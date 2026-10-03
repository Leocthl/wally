// A hold (press and hold to confirm) opens its dialog while the finger, the mouse button or the key is still down. What
// that press does next is not an answer: its release, the click a touch screen sends after it (it lands on whatever is
// under the finger by then) and a held key's repeats. Dialog and Sheet ignore exactly those. A surface opened by a click
// has nothing down, a press that starts inside it is the person answering, and a click from the keyboard or a screen
// reader (no pointer) always counts.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "../src/ui/Button";
import { Dialog, Sheet } from "../src/ui/Overlay";

const TOUCH = { pointerId: 7, pointerType: "touch" } as const;
const OTHER_FINGER = { pointerId: 8, pointerType: "touch" } as const;
const TAP = { detail: 1 } as const;

interface Spies {
  readonly confirm: () => void;
  readonly close: () => void;
}

/** Opens on pointerdown or on Enter/Space keydown, the way a hold-to-confirm button does once its hold completes. */
function PressOpens({ confirm, close, kind }: Spies & { readonly kind: "dialog" | "sheet" }): ReactElement {
  const [open, setOpen] = useState(false);
  const done = (): void => {
    close();
    setOpen(false);
  };
  const yes = <Button onClick={() => { confirm(); setOpen(false); }}>Yes</Button>;
  const no = <Button variant="ghost" onClick={done}>No</Button>;
  return (
    <>
      <button type="button" onPointerDown={() => setOpen(true)} onKeyDown={(e) => { if (e.key === "Enter" && !e.repeat) { e.preventDefault(); setOpen(true); } }}>Hold</button>
      {kind === "dialog" ? (
        <Dialog open={open} onClose={done} role="alertdialog" title="Sure?" actions={<>{yes}{no}</>}>Really?</Dialog>
      ) : (
        <Sheet open={open} onClose={done} title="Sure?" footer={<>{yes}{no}</>}><p>Really?</p></Sheet>
      )}
    </>
  );
}

function ClickOpens({ confirm, close }: Spies): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <Dialog open={open} onClose={() => { close(); setOpen(false); }} title="Sure?" actions={<Button onClick={() => { confirm(); setOpen(false); }}>Yes</Button>}>Really?</Dialog>
    </>
  );
}

const hold = () => screen.getByRole("button", { name: "Hold" });
const yes = () => screen.getByRole("button", { name: "Yes" });
const no = () => screen.getByRole("button", { name: "No" });
const scrim = () => document.querySelector<HTMLElement>(".w-scrim")!;
const isOpen = () => screen.queryByRole("alertdialog") !== null || screen.queryByRole("dialog") !== null;
const settle = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.style.overflow = "";
});

describe.each(["dialog", "sheet"] as const)("a %s opened by a press that is still down", (kind) => {
  function mount() {
    const spies = { confirm: vi.fn(), close: vi.fn() };
    render(<PressOpens {...spies} kind={kind} />);
    fireEvent.pointerDown(hold(), TOUCH);
    settle(0);
    expect(isOpen()).toBe(true);
    return spies;
  }

  it("is not closed or confirmed by the release or by the click the touch screen sends after it", () => {
    const spies = mount();
    fireEvent.pointerUp(no(), TOUCH);
    fireEvent.click(no(), TAP);
    fireEvent.click(yes(), TAP);
    fireEvent.click(scrim(), TAP);
    expect(isOpen()).toBe(true);
    expect(spies.confirm).not.toHaveBeenCalled();
    expect(spies.close).not.toHaveBeenCalled();
  });

  it("ignores a pointer click while the finger is still down, however long the hold goes on", () => {
    const spies = mount();
    settle(5_000);
    fireEvent.click(yes(), TAP);
    fireEvent.click(scrim(), TAP);
    expect(isOpen()).toBe(true);
    expect(spies.confirm).not.toHaveBeenCalled();
  });

  it("answers a press that starts inside it, straight after the release", () => {
    const spies = mount();
    fireEvent.pointerUp(no(), TOUCH);
    fireEvent.pointerDown(yes(), OTHER_FINGER);
    fireEvent.pointerUp(yes(), OTHER_FINGER);
    fireEvent.click(yes(), TAP);
    expect(spies.confirm).toHaveBeenCalledTimes(1);
  });

  it("answers a click once the release is long enough ago, even without a pointerdown of its own", () => {
    const spies = mount();
    fireEvent.pointerUp(no(), TOUCH);
    settle(1_000);
    fireEvent.click(no(), TAP);
    expect(spies.close).toHaveBeenCalledTimes(1);
    settle(1_000);
    expect(isOpen()).toBe(false);
  });

  it("never swallows a click from the keyboard or a screen reader (no pointer, detail 0), even mid-press", () => {
    const spies = mount();
    fireEvent.click(yes());
    expect(spies.confirm).toHaveBeenCalledTimes(1);
  });

  it("still closes on Escape mid-press", async () => {
    const spies = mount();
    fireEvent.keyDown(within(document.body).getByRole(kind === "dialog" ? "alertdialog" : "dialog"), { key: "Escape" });
    expect(spies.close).toHaveBeenCalledTimes(1);
  });

  it("forgets a press that never ended when the window loses focus", () => {
    const spies = mount();
    fireEvent.blur(window);
    settle(1_000);
    fireEvent.click(no(), TAP);
    expect(spies.close).toHaveBeenCalledTimes(1);
  });
});

describe("a dialog opened by a click", () => {
  it("answers the next click at once: nothing was down", () => {
    const spies = { confirm: vi.fn(), close: vi.fn() };
    render(<ClickOpens {...spies} />);
    const opener = screen.getByRole("button", { name: "Open" });
    fireEvent.pointerDown(opener, { pointerId: 1, pointerType: "mouse" });
    fireEvent.pointerUp(opener, { pointerId: 1, pointerType: "mouse" });
    fireEvent.click(opener, TAP);
    expect(isOpen()).toBe(true);
    fireEvent.click(yes(), TAP);
    expect(spies.confirm).toHaveBeenCalledTimes(1);
  });

  it("answers a real user click, pointer events and all", async () => {
    vi.useRealTimers();
    const spies = { confirm: vi.fn(), close: vi.fn() };
    render(<ClickOpens {...spies} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(yes());
    expect(spies.confirm).toHaveBeenCalledTimes(1);
  });
});

describe("a dialog opened while a key is held", () => {
  function mount() {
    const spies = { confirm: vi.fn(), close: vi.fn() };
    render(<PressOpens {...spies} kind="dialog" />);
    hold().focus();
    fireEvent.keyDown(hold(), { key: "Enter", code: "Enter" });
    settle(0);
    expect(isOpen()).toBe(true);
    return spies;
  }

  it("ignores the held key's repeats and its release, so the key that opened it cannot answer it", () => {
    const spies = mount();
    const repeat = fireEvent.keyDown(yes(), { key: "Enter", code: "Enter", repeat: true });
    expect(repeat).toBe(false); // preventDefault: the browser does not click the focused button for it
    const release = fireEvent.keyUp(yes(), { key: "Enter", code: "Enter" });
    expect(release).toBe(false);
    expect(spies.confirm).not.toHaveBeenCalled();
  });

  it("answers a fresh press of the same key afterwards", () => {
    mount();
    fireEvent.keyUp(yes(), { key: "Enter", code: "Enter" });
    const fresh = fireEvent.keyDown(yes(), { key: "Enter", code: "Enter" });
    expect(fresh).toBe(true); // not prevented: the browser clicks the focused button
    const again = fireEvent.keyDown(yes(), { key: "Enter", code: "Enter", repeat: true });
    expect(again).toBe(true); // a new hold of the same key is not the one that opened the dialog
  });

  it("lets other keys through: Tab still wraps inside, and a repeating letter is not touched", () => {
    mount();
    no().focus();
    fireEvent.keyDown(no(), { key: "Tab", code: "Tab" });
    expect(yes()).toHaveFocus(); // the focus trap saw the Tab
    expect(fireEvent.keyDown(yes(), { key: "a", code: "KeyA", repeat: true })).toBe(true);
  });
});
