// Dragging a sheet: the pure rules (friction above the resting place, velocity, close on distance or on a flick) and the
// DOM contract (follows the finger, a short release settles from where it is and never restarts, a long one closes).
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { CLOSE_DISTANCE_PX, dragOffset, FLICK_MIN_PX, FLICK_PX_PER_MS, releaseDecision, rubberBand, velocityOf } from "../src/ui/hooks/useSheetDrag";
import { Sheet } from "../src/ui/Overlay";

describe("sheet drag rules", () => {
  it("lets a downward drag follow the finger 1:1 and pulls up with friction", () => {
    expect(dragOffset(80, 600)).toBe(80);
    const up = dragOffset(-80, 600);
    expect(up).toBeLessThan(0);
    expect(Math.abs(up)).toBeLessThan(80);
    expect(Math.abs(dragOffset(-400, 600))).toBeLessThan(Math.abs(dragOffset(-200, 600)) * 2); // the further, the less it moves
  });

  it("bends but never reaches the dimension (rubber band)", () => {
    expect(rubberBand(10, 100)).toBeGreaterThan(0);
    expect(rubberBand(10_000, 100)).toBeLessThan(100);
  });

  it("measures downward velocity over the last moments only", () => {
    expect(velocityOf([])).toBe(0);
    expect(velocityOf([{ y: 10, t: 0 }])).toBe(0);
    expect(velocityOf([{ y: 0, t: 0 }, { y: 50, t: 50 }])).toBeCloseTo(1, 5);
    // a long pause before the last flick does not drag the average down
    expect(velocityOf([{ y: 0, t: 0 }, { y: 0, t: 400 }, { y: 30, t: 430 }])).toBeCloseTo(1, 5);
  });

  it("closes on distance or on a flick, and settles on a slow short drag or a twitch", () => {
    expect(releaseDecision(CLOSE_DISTANCE_PX, 0)).toBe("close");
    expect(releaseDecision(FLICK_MIN_PX + 1, FLICK_PX_PER_MS + 0.05)).toBe("close");
    expect(releaseDecision(40, FLICK_PX_PER_MS / 2)).toBe("settle");
    expect(releaseDecision(FLICK_MIN_PX - 4, 2)).toBe("settle");
    expect(releaseDecision(-30, 3)).toBe("settle");
  });
});

function Demo({ onClose }: { readonly onClose: () => void }): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <Sheet open={open} onClose={() => { onClose(); setOpen(false); }} title="About Wally">
      <p>Body</p>
    </Sheet>
  );
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A deliberate drag: a pause between moves, so the last 90 ms hold one sample and the release has no velocity. */
async function drag(handle: Element, from: number, to: number, pointerId = 1): Promise<void> {
  fireEvent.pointerDown(handle, { pointerId, clientY: from, button: 0, pointerType: "touch" });
  await pause(120);
  fireEvent.pointerMove(handle, { pointerId, clientY: (from + to) / 2, pointerType: "touch" });
  await pause(120);
  fireEvent.pointerMove(handle, { pointerId, clientY: to, pointerType: "touch" });
  await pause(120);
}

describe("Sheet drag", () => {
  it("follows the finger, then a short release settles back without closing", async () => {
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);
    const handle = document.querySelector(".w-sheet__top") as HTMLElement;
    const panel = screen.getByRole("dialog");
    const overlay = panel.parentElement as HTMLElement;
    await drag(handle, 100, 140);
    expect(panel.style.transform).toBe("translateY(40px)");
    expect(overlay.getAttribute("data-dragging")).toBe("true");
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 140, pointerType: "touch" });
    expect(onClose).not.toHaveBeenCalled();
    expect(overlay.hasAttribute("data-dragging")).toBe(false);
    expect(panel.style.transform).toBe(""); // CSS transitions from the live offset to rest; nothing restarts
    expect(panel.getAttribute("data-settling")).toBe("true");
  });

  it("closes from a long drag and leaves the live offset for the exit to start from", async () => {
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);
    const handle = document.querySelector(".w-sheet__top") as HTMLElement;
    await drag(handle, 100, 100 + CLOSE_DISTANCE_PX + 30);
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 100 + CLOSE_DISTANCE_PX + 30, pointerType: "touch" });
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("ignores a second finger while one is dragging, and a cancel settles", async () => {
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);
    const handle = document.querySelector(".w-sheet__top") as HTMLElement;
    const panel = screen.getByRole("dialog");
    await drag(handle, 100, 130, 1);
    fireEvent.pointerDown(handle, { pointerId: 2, clientY: 400, button: 0, pointerType: "touch" });
    fireEvent.pointerMove(handle, { pointerId: 2, clientY: 600, pointerType: "touch" });
    expect(panel.style.transform).toBe("translateY(30px)");
    fireEvent.pointerCancel(handle, { pointerId: 1, clientY: 130, pointerType: "touch" });
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe("");
  });

  it("leaves the close button its own click (no drag starts from a control)", () => {
    render(<Demo onClose={() => undefined} />);
    const panel = screen.getByRole("dialog");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Close" }), { pointerId: 1, clientY: 100, button: 0, pointerType: "touch" });
    fireEvent.pointerMove(document.querySelector(".w-sheet__top") as HTMLElement, { pointerId: 1, clientY: 200, pointerType: "touch" });
    expect(panel.style.transform).toBe("");
    expect((panel.parentElement as HTMLElement).hasAttribute("data-dragging")).toBe(false);
  });
});
