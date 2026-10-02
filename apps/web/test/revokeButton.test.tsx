// RevokeButton: hold to confirm, early release cancels, keyboard holds Space or Enter (docs/04 Components, Accessibility).
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RevokeButton } from "../src/components/RevokeButton";
import { HOLD_MS } from "../src/design/motion";
import { setReducedMotion } from "./setup";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const button = () => screen.getByRole("button", { name: /hold to revoke/i });

describe("RevokeButton (pointer)", () => {
  it("does nothing on a quick tap", () => {
    const onRevoke = vi.fn();
    render(<RevokeButton onRevoke={onRevoke} />);
    fireEvent.pointerDown(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS - 1));
    fireEvent.pointerUp(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS * 2));
    expect(onRevoke).not.toHaveBeenCalled();
  });

  it("confirms exactly once after the full hold duration", () => {
    const onRevoke = vi.fn();
    render(<RevokeButton onRevoke={onRevoke} />);
    fireEvent.pointerDown(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS - 1));
    expect(onRevoke).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onRevoke).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(HOLD_MS * 3));
    expect(onRevoke).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(/revoked/i);
  });

  it("cancels when the pointer leaves before the hold completes", () => {
    const onRevoke = vi.fn();
    render(<RevokeButton onRevoke={onRevoke} />);
    fireEvent.pointerDown(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS / 2));
    fireEvent.pointerLeave(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS));
    expect(onRevoke).not.toHaveBeenCalled();
  });

  it("starts over after a cancelled hold", () => {
    const onRevoke = vi.fn();
    render(<RevokeButton onRevoke={onRevoke} />);
    fireEvent.pointerDown(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS - 100));
    fireEvent.pointerUp(button());
    fireEvent.pointerDown(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS - 1));
    expect(onRevoke).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onRevoke).toHaveBeenCalledTimes(1);
  });

  it("ignores everything while disabled", () => {
    const onRevoke = vi.fn();
    render(<RevokeButton onRevoke={onRevoke} disabled />);
    fireEvent.pointerDown(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS * 2));
    expect(onRevoke).not.toHaveBeenCalled();
  });
});

describe("RevokeButton (keyboard)", () => {
  it.each(["Enter", " "])("holds %j for the full duration", (key) => {
    const onRevoke = vi.fn();
    render(<RevokeButton onRevoke={onRevoke} />);
    fireEvent.keyDown(button(), { key });
    act(() => void vi.advanceTimersByTime(HOLD_MS));
    expect(onRevoke).toHaveBeenCalledTimes(1);
  });

  it("cancels on early key release", () => {
    const onRevoke = vi.fn();
    render(<RevokeButton onRevoke={onRevoke} />);
    fireEvent.keyDown(button(), { key: " " });
    act(() => void vi.advanceTimersByTime(HOLD_MS / 2));
    fireEvent.keyUp(button(), { key: " " });
    act(() => void vi.advanceTimersByTime(HOLD_MS));
    expect(onRevoke).not.toHaveBeenCalled();
  });

  it("does not restart the hold on key auto-repeat", () => {
    const onRevoke = vi.fn();
    render(<RevokeButton onRevoke={onRevoke} />);
    fireEvent.keyDown(button(), { key: "Enter" });
    act(() => void vi.advanceTimersByTime(HOLD_MS - 200));
    fireEvent.keyDown(button(), { key: "Enter", repeat: true });
    act(() => void vi.advanceTimersByTime(200));
    expect(onRevoke).toHaveBeenCalledTimes(1);
  });

  it("cancels when focus moves away mid-hold", () => {
    const onRevoke = vi.fn();
    render(<RevokeButton onRevoke={onRevoke} />);
    fireEvent.keyDown(button(), { key: "Enter" });
    fireEvent.blur(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS * 2));
    expect(onRevoke).not.toHaveBeenCalled();
  });

  it("is a real button with an accessible hint and a 44px target class", () => {
    render(<RevokeButton onRevoke={() => undefined} />);
    expect(button().tagName).toBe("BUTTON");
    expect(button()).toHaveAccessibleDescription(/release early to cancel/i);
    expect(button()).toHaveClass("tap");
  });
});

describe("RevokeButton (reduced motion)", () => {
  it("keeps the hold duration but fills in steps instead of a smooth fill", () => {
    setReducedMotion(true);
    const onRevoke = vi.fn();
    render(<RevokeButton onRevoke={onRevoke} />);
    expect(button()).toHaveAttribute("data-motion", "reduced");
    fireEvent.pointerDown(button());
    act(() => void vi.advanceTimersByTime(HOLD_MS / 2));
    const step = Number(button().getAttribute("data-step"));
    expect(step).toBeGreaterThan(0);
    expect(onRevoke).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(HOLD_MS / 2));
    expect(onRevoke).toHaveBeenCalledTimes(1);
  });

  it("uses the smooth fill when motion is allowed", () => {
    render(<RevokeButton onRevoke={() => undefined} />);
    expect(button()).toHaveAttribute("data-motion", "full");
  });
});
