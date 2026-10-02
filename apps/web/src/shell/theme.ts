// Appearance choice (Auto, Light, Dark): applied to <html data-theme> and remembered on this device. The browser bar and
// the status bar follow it too: the static theme-color tags in index.html answer the OS setting only, so a forced theme
// writes the page background (read from the tokens) into them, and Auto puts the originals back.
import { useCallback, useEffect, useState } from "react";
import { applyTheme, type ThemeChoice } from "../ui/hooks/useColorScheme";

export const THEME_KEY = "wally:theme";
const THEME_COLOR_TAGS = 'meta[name="theme-color"]';

/** "rgb(11, 18, 32)" or "rgb(11 18 32)" as #0b1220; null for anything else (a value the browser kept unresolved). */
export function rgbToHex(rgb: string): string | null {
  const m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(rgb.trim());
  if (!m) return null;
  const parts = [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)));
  return `#${parts.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** The page background as it resolves now: the tokens answer light or dark by data-theme or by the OS. */
export function currentBackground(doc: Document = document): string | null {
  try {
    const probe = doc.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;color:var(--c-bg)";
    doc.body.appendChild(probe);
    const resolved = doc.defaultView?.getComputedStyle(probe).color ?? "";
    probe.remove();
    return rgbToHex(resolved);
  } catch {
    return null;
  }
}

export function syncThemeColor(choice: ThemeChoice, doc: Document = document): void {
  const forced = choice === "auto" ? null : currentBackground(doc);
  doc.querySelectorAll<HTMLMetaElement>(THEME_COLOR_TAGS).forEach((tag) => {
    tag.dataset["original"] ??= tag.content;
    tag.content = forced ?? tag.dataset["original"] ?? tag.content;
  });
}

export function readTheme(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

function saveTheme(choice: ThemeChoice): void {
  try {
    if (choice === "auto") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

export function useTheme(): readonly [ThemeChoice, (next: ThemeChoice) => void] {
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  useEffect(() => {
    applyTheme(theme);
    syncThemeColor(theme);
  }, [theme]);
  const choose = useCallback((next: ThemeChoice) => {
    saveTheme(next);
    setTheme(next);
  }, []);
  return [theme, choose];
}
