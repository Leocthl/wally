// The colour scheme in use: an explicit data-theme on <html> wins over the OS preference (tokens.css does the same).
import { useEffect, useState } from "react";
import { DARK_SCHEME, useMediaQuery } from "./useMediaQuery";

export type Scheme = "light" | "dark";
export type ThemeChoice = "auto" | Scheme;

function readForced(): Scheme | null {
  if (typeof document === "undefined") return null;
  const v = document.documentElement.getAttribute("data-theme");
  return v === "light" || v === "dark" ? v : null;
}

export function useColorScheme(): Scheme {
  const osDark = useMediaQuery(DARK_SCHEME);
  const [forced, setForced] = useState<Scheme | null>(readForced);
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return undefined;
    const obs = new MutationObserver(() => setForced(readForced()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return forced ?? (osDark ? "dark" : "light");
}

/** Sets or clears the override on <html>. "auto" follows the OS. */
export function applyTheme(choice: ThemeChoice): void {
  if (choice === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choice);
}
