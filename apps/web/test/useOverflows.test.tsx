// useOverflows: true while an element's content is taller than the element, read at mount and again whenever its box changes
// (a ResizeObserver). A region that scrolls becomes a tab stop only then. jsdom has no layout and no ResizeObserver, so both
// are faked: the heights come from spies on Element, and the observer hands its callback to the test.
import { act, render, screen } from "@testing-library/react";
import { useRef, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOverflows } from "../src/ui/hooks/useOverflows";

class FakeObserver {
  static latest: FakeObserver | null = null;
  disconnected = false;
  readonly #callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    FakeObserver.latest = this;
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true;
  }

  /** The box changed. */
  fire(): void {
    this.#callback([], this as unknown as ResizeObserver);
  }
}

function heights(scroll: number, client: number): void {
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(scroll);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(client);
}

function Region(): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const scrolls = useOverflows(ref);
  return (
    <div ref={ref} data-testid="region" tabIndex={scrolls ? 0 : undefined}>
      words
    </div>
  );
}

const isTabStop = (): boolean => screen.getByTestId("region").hasAttribute("tabindex");

afterEach(() => {
  vi.restoreAllMocks();
  FakeObserver.latest = null;
});

describe("useOverflows", () => {
  it("is false while the content fits", () => {
    vi.stubGlobal("ResizeObserver", FakeObserver);
    heights(60, 60);
    render(<Region />);
    expect(isTabStop()).toBe(false);
  });

  it("is true from the first paint when the content is taller than the element", () => {
    vi.stubGlobal("ResizeObserver", FakeObserver);
    heights(120, 60);
    render(<Region />);
    expect(isTabStop()).toBe(true);
  });

  it("lets one pixel of rounding go: zoom rounds the two heights apart by a hair", () => {
    vi.stubGlobal("ResizeObserver", FakeObserver);
    heights(61, 60);
    render(<Region />);
    expect(isTabStop()).toBe(false);
  });

  it("reads the heights again when the box changes, both ways", () => {
    vi.stubGlobal("ResizeObserver", FakeObserver);
    heights(60, 60);
    render(<Region />);
    expect(isTabStop()).toBe(false);
    vi.restoreAllMocks();
    heights(120, 60);
    act(() => FakeObserver.latest?.fire());
    expect(isTabStop()).toBe(true);
    vi.restoreAllMocks();
    heights(60, 60);
    act(() => FakeObserver.latest?.fire());
    expect(isTabStop()).toBe(false);
  });

  it("stops watching when the region goes away", () => {
    vi.stubGlobal("ResizeObserver", FakeObserver);
    heights(60, 60);
    const { unmount } = render(<Region />);
    const observer = FakeObserver.latest;
    expect(observer?.disconnected).toBe(false);
    unmount();
    expect(observer?.disconnected).toBe(true);
  });

  it("still measures once where there is no ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    heights(120, 60);
    render(<Region />);
    expect(isTabStop()).toBe(true);
  });
});
