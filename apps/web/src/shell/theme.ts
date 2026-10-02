// Appearance choice (Auto, Light, Dark): applied to <html data-theme> and remembered on this device.
import { useCallback, useEffect, useState } from "react";
import { applyTheme, type ThemeChoice } from "../ui/hooks/useColorScheme";

export const THEME_KEY = "wally:theme";

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
  }, [theme]);
  const choose = useCallback((next: ThemeChoice) => {
    saveTheme(next);
    setTheme(next);
  }, []);
  return [theme, choose];
}
