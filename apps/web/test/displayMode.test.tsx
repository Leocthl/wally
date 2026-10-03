// The display mode store: plain by default, developer on request (the About switch, `?dev=1`), remembered on this device
// under wally:mode, and never broken by blocked storage. The hook follows every change, from this tab or another.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODE_KEY, modeFromSearch, readDisplayMode, setDisplayMode, useDisplayMode } from "../src/state/displayMode";

function setUrl(search: string, hash = ""): void {
  window.history.replaceState(null, "", `/${search}${hash}`);
}

beforeEach(() => {
  window.localStorage.clear();
  setUrl("");
});
afterEach(() => {
  vi.restoreAllMocks(); // first: a mocked setItem must not break the clear below
  window.localStorage.clear();
  setUrl("");
});

describe("modeFromSearch", () => {
  it("reads ?dev=1 as developer and ?dev=0 as plain, anything else as no override", () => {
    expect(modeFromSearch("?dev=1")).toBe("developer");
    expect(modeFromSearch("?api=local&dev=1")).toBe("developer");
    expect(modeFromSearch("?dev=0")).toBe("plain");
    expect(modeFromSearch("")).toBeNull();
    expect(modeFromSearch("?dev")).toBeNull();
    expect(modeFromSearch("?dev=yes")).toBeNull();
    expect(modeFromSearch("?dev=2")).toBeNull();
    expect(modeFromSearch("?developer=1")).toBeNull();
  });
});

describe("readDisplayMode", () => {
  it("is plain on a fresh device", () => {
    expect(readDisplayMode()).toBe("plain");
  });

  it("reads the remembered choice", () => {
    window.localStorage.setItem(MODE_KEY, "developer");
    expect(readDisplayMode()).toBe("developer");
    window.localStorage.setItem(MODE_KEY, "plain");
    expect(readDisplayMode()).toBe("plain");
  });

  it("ignores a stored value it does not know", () => {
    window.localStorage.setItem(MODE_KEY, "nerd");
    expect(readDisplayMode()).toBe("plain");
  });

  it("lets the address override what is stored, either way", () => {
    window.localStorage.setItem(MODE_KEY, "plain");
    setUrl("?dev=1");
    expect(readDisplayMode()).toBe("developer");
    window.localStorage.setItem(MODE_KEY, "developer");
    setUrl("?dev=0");
    expect(readDisplayMode()).toBe("plain");
  });

  it("does not store an address override: leaving the page leaves nothing behind", () => {
    setUrl("?dev=1");
    expect(readDisplayMode()).toBe("developer");
    expect(window.localStorage.getItem(MODE_KEY)).toBeNull();
  });

  it("falls back to plain when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readDisplayMode()).toBe("plain");
  });
});

describe("setDisplayMode", () => {
  it("remembers the choice under wally:mode", () => {
    setDisplayMode("developer");
    expect(window.localStorage.getItem(MODE_KEY)).toBe("developer");
    expect(readDisplayMode()).toBe("developer");
    setDisplayMode("plain");
    expect(window.localStorage.getItem(MODE_KEY)).toBe("plain");
    expect(readDisplayMode()).toBe("plain");
  });

  it("takes ?dev out of the address, keeping the other parameters and the route, so the address never contradicts the switch", () => {
    setUrl("?api=local&dev=1", "#/proof");
    setDisplayMode("plain");
    expect(window.location.search).toBe("?api=local");
    expect(window.location.hash).toBe("#/proof");
    expect(readDisplayMode()).toBe("plain");
  });

  it("leaves an address without ?dev alone", () => {
    setUrl("?api=local", "#/evidence");
    setDisplayMode("developer");
    expect(window.location.search).toBe("?api=local");
    expect(window.location.hash).toBe("#/evidence");
  });

  it("still works for this page when storage is blocked", async () => {
    // A fresh copy of the store: the choice it holds for the page must not leak into the other tests.
    vi.resetModules();
    const fresh = await import("../src/state/displayMode");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => fresh.setDisplayMode("developer")).not.toThrow();
    expect(fresh.readDisplayMode()).toBe("developer");
    expect(() => fresh.setDisplayMode("plain")).not.toThrow();
    expect(fresh.readDisplayMode()).toBe("plain");
  });

  it("lets a choice storage would not keep beat an older remembered one", async () => {
    vi.resetModules();
    const fresh = await import("../src/state/displayMode");
    window.localStorage.setItem(MODE_KEY, "plain");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    fresh.setDisplayMode("developer");
    expect(fresh.readDisplayMode()).toBe("developer");
  });
});

function Probe(): ReactElement {
  const [mode, setMode] = useDisplayMode();
  return (
    <button type="button" data-mode={mode} onClick={() => setMode(mode === "plain" ? "developer" : "plain")}>
      {mode}
    </button>
  );
}

describe("useDisplayMode", () => {
  it("starts plain and flips on request, for every component that reads it", async () => {
    render(<><Probe /><span data-testid="second"><Probe /></span></>);
    const [first] = screen.getAllByRole("button");
    expect(first).toHaveTextContent("plain");
    await userEvent.setup().click(first as HTMLElement);
    for (const b of screen.getAllByRole("button")) expect(b).toHaveTextContent("developer");
    expect(window.localStorage.getItem(MODE_KEY)).toBe("developer");
  });

  it("starts in developer mode for ?dev=1 and for a remembered choice", () => {
    setUrl("?dev=1");
    const first = render(<Probe />);
    expect(screen.getByRole("button")).toHaveTextContent("developer");
    first.unmount();
    setUrl("");
    window.localStorage.setItem(MODE_KEY, "developer");
    render(<Probe />);
    expect(screen.getByRole("button")).toHaveTextContent("developer");
  });

  it("follows a change made in another tab (the storage event)", () => {
    render(<Probe />);
    expect(screen.getByRole("button")).toHaveTextContent("plain");
    act(() => {
      window.localStorage.setItem(MODE_KEY, "developer");
      window.dispatchEvent(new StorageEvent("storage", { key: MODE_KEY, newValue: "developer" }));
    });
    expect(screen.getByRole("button")).toHaveTextContent("developer");
  });

  it("ignores storage events for other keys", () => {
    render(<Probe />);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "wally:theme", newValue: "dark" }));
    });
    expect(screen.getByRole("button")).toHaveTextContent("plain");
  });
});
