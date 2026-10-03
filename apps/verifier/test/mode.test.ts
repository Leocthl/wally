// Display mode: plain by default, developer on request (the switch, `?dev=1`), remembered under wally:mode (the key the
// Wally app uses), and never broken by blocked storage or an address that cannot be rewritten (file://).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMode, chooseMode, currentMode, initialMode, MODE_KEY, modeFromSearch, readStoredMode, storeMode } from "../src/mode";

const html = document.documentElement;

function setUrl(search: string, hash = ""): void {
  window.history.replaceState(null, "", `/${search}${hash}`);
}

beforeEach(() => {
  window.localStorage.clear();
  setUrl("");
  html.removeAttribute("data-mode");
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  setUrl("");
  html.removeAttribute("data-mode");
});

describe("the key", () => {
  it("is the key the Wally app uses, so the page shares the choice when served from the app's origin", () => {
    expect(MODE_KEY).toBe("wally:mode");
  });
});

describe("modeFromSearch", () => {
  it.each([
    ["?dev=1", "developer"],
    ["?api=local&dev=1", "developer"],
    ["?dev=0", "plain"],
    ["?x=1&dev=0&y=2", "plain"],
    ["dev=1", "developer"],
    ["?dev=1&dev=0", "developer"],
    ["", null],
    ["?", null],
    ["?dev", null],
    ["?dev=", null],
    ["?dev=yes", null],
    ["?dev=2", null],
    ["?dev=true", null],
    ["?developer=1", null],
    ["?DEV=1", null],
  ] as const)("%j gives %s", (search, expected) => {
    expect(modeFromSearch(search)).toBe(expected);
  });
});

describe("initialMode", () => {
  it("is plain on a fresh device", () => {
    expect(initialMode()).toBe("plain");
  });

  it("reads the remembered choice", () => {
    window.localStorage.setItem(MODE_KEY, "developer");
    expect(initialMode()).toBe("developer");
    window.localStorage.setItem(MODE_KEY, "plain");
    expect(initialMode()).toBe("plain");
  });

  it.each(["nerd", "Developer", "PLAIN", "1", "", "null", "{}"])("ignores a stored value it does not know (%j)", (junk) => {
    window.localStorage.setItem(MODE_KEY, junk);
    expect(readStoredMode()).toBeNull();
    expect(initialMode()).toBe("plain");
  });

  it("lets the address override what is stored, either way", () => {
    window.localStorage.setItem(MODE_KEY, "plain");
    setUrl("?dev=1");
    expect(initialMode()).toBe("developer");
    window.localStorage.setItem(MODE_KEY, "developer");
    setUrl("?dev=0");
    expect(initialMode()).toBe("plain");
  });

  it("does not store an address override: leaving the page leaves nothing behind", () => {
    setUrl("?dev=1");
    expect(initialMode()).toBe("developer");
    expect(window.localStorage.getItem(MODE_KEY)).toBeNull();
  });

  it("falls back to plain when storage throws, and still honours the address", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(readStoredMode()).toBeNull();
    expect(initialMode()).toBe("plain");
    setUrl("?dev=1");
    expect(initialMode()).toBe("developer");
  });
});

describe("storeMode", () => {
  it("remembers the choice and says so", () => {
    expect(storeMode("developer")).toBe(true);
    expect(window.localStorage.getItem(MODE_KEY)).toBe("developer");
    expect(storeMode("plain")).toBe(true);
    expect(window.localStorage.getItem(MODE_KEY)).toBe("plain");
  });

  it("never throws when storage is blocked or full, and says the choice was not kept", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => storeMode("developer")).not.toThrow();
    expect(storeMode("developer")).toBe(false);
  });
});

describe("applyMode and currentMode", () => {
  it("sets and reads data-mode on the html element", () => {
    applyMode("developer");
    expect([html.dataset["mode"], currentMode()]).toEqual(["developer", "developer"]);
    applyMode("plain");
    expect([html.dataset["mode"], currentMode()]).toEqual(["plain", "plain"]);
  });

  it("reads plain when the attribute is missing or holds something else", () => {
    expect(currentMode()).toBe("plain");
    html.dataset["mode"] = "nerd";
    expect(currentMode()).toBe("plain");
  });

  it("works on any element it is given", () => {
    const other = document.createElement("div");
    applyMode("developer", other);
    expect(currentMode(other)).toBe("developer");
    expect(html.dataset["mode"]).toBeUndefined();
  });
});

describe("chooseMode", () => {
  it("applies the mode and remembers it", () => {
    chooseMode("developer");
    expect(currentMode()).toBe("developer");
    expect(window.localStorage.getItem(MODE_KEY)).toBe("developer");
    chooseMode("plain");
    expect(currentMode()).toBe("plain");
    expect(window.localStorage.getItem(MODE_KEY)).toBe("plain");
  });

  it("takes ?dev out of the address, keeping the other parameters and the hash, so the address never contradicts the switch", () => {
    setUrl("?api=local&dev=1", "#/proof");
    chooseMode("plain");
    expect(window.location.search).toBe("?api=local");
    expect(window.location.hash).toBe("#/proof");
    expect(initialMode()).toBe("plain");
  });

  it("leaves an address without ?dev alone (no history call at all)", () => {
    setUrl("?api=local", "#/evidence");
    const replace = vi.spyOn(window.history, "replaceState");
    chooseMode("developer");
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?api=local");
    expect(window.location.hash).toBe("#/evidence");
  });

  it("still switches the page when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => chooseMode("developer")).not.toThrow();
    expect(currentMode()).toBe("developer");
  });

  it("still switches the page when the address cannot be rewritten (file:// throws a SecurityError)", () => {
    setUrl("?dev=1");
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {
      throw new DOMException("origin null", "SecurityError");
    });
    expect(() => chooseMode("plain")).not.toThrow();
    expect(currentMode()).toBe("plain");
    expect(window.localStorage.getItem(MODE_KEY)).toBe("plain");
  });
});
