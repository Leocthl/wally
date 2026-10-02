// The browser bar follows the in-app theme: a forced theme writes the page background into the theme-color tags, Auto
// puts the tags from index.html back.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rgbToHex, syncThemeColor } from "../src/shell/theme";

describe("rgbToHex", () => {
  it("reads comma and space forms, clamps, and refuses anything unresolved", () => {
    expect(rgbToHex("rgb(11, 18, 32)")).toBe("#0b1220");
    expect(rgbToHex("rgb(244 247 254)")).toBe("#f4f7fe");
    expect(rgbToHex("rgba(0, 0, 0, 0.5)")).toBe("#000000");
    expect(rgbToHex("rgb(300, 0, 0)")).toBe("#ff0000");
    expect(rgbToHex("var(--c-bg)")).toBeNull();
    expect(rgbToHex("")).toBeNull();
  });
});

describe("syncThemeColor", () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="theme-color" content="#F4F7FE" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0B1220" media="(prefers-color-scheme: dark)">';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = "";
  });

  const contents = (): string[] => [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => m.content);

  it("sets every tag to the resolved background for a forced theme, and restores the originals for Auto", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ color: "rgb(11, 18, 32)" } as CSSStyleDeclaration);
    syncThemeColor("dark");
    expect(contents()).toEqual(["#0b1220", "#0b1220"]);
    syncThemeColor("auto");
    expect(contents()).toEqual(["#F4F7FE", "#0B1220"]);
  });

  it("leaves the tags alone when the background cannot be resolved", () => {
    syncThemeColor("light");
    expect(contents()).toEqual(["#F4F7FE", "#0B1220"]);
  });
});
