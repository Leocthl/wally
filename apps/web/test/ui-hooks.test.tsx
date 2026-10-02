// Hooks and helpers: media queries react to changes, colour scheme honours data-theme, standalone detection, locale
// detection and memory, roving focus maths, haptics only where supported and never under reduced motion.
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HAPTIC_PATTERNS, haptic } from "../src/ui/haptics";
import { applyTheme, useColorScheme } from "../src/ui/hooks/useColorScheme";
import { useMediaQuery, useReducedMotion, useStandalone } from "../src/ui/hooks/useMediaQuery";
import { nextIndex } from "../src/ui/hooks/useRoving";
import { detectLocale, LocaleProvider, useLocale } from "../src/ui/locale";

type Listener = () => void;
const matches = new Map<string, boolean>();
const listeners = new Map<string, Set<Listener>>();

function setQuery(query: string, value: boolean): void {
  matches.set(query, value);
  for (const l of listeners.get(query) ?? []) l();
}

beforeEach(() => {
  matches.clear();
  listeners.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return matches.get(query) ?? false;
    },
    media: query,
    addEventListener: (_: string, l: Listener) => listeners.set(query, (listeners.get(query) ?? new Set()).add(l)),
    removeEventListener: (_: string, l: Listener) => listeners.get(query)?.delete(l),
  }));
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.clear();
});

describe("media query hooks", () => {
  it("useMediaQuery follows change events", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 60rem)"));
    expect(result.current).toBe(false);
    act(() => setQuery("(min-width: 60rem)", true));
    expect(result.current).toBe(true);
  });

  it("useReducedMotion and useStandalone read their queries", () => {
    setQuery("(prefers-reduced-motion: reduce)", true);
    setQuery("(display-mode: standalone)", true);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
    expect(renderHook(() => useStandalone()).result.current).toBe(true);
  });

  it("useColorScheme follows the OS until data-theme forces a scheme", async () => {
    const { result } = renderHook(() => useColorScheme());
    expect(result.current).toBe("light");
    act(() => setQuery("(prefers-color-scheme: dark)", true));
    expect(result.current).toBe("dark");
    await act(async () => {
      applyTheme("light");
      await Promise.resolve();
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(result.current).toBe("light");
    await act(async () => {
      applyTheme("auto");
      await Promise.resolve();
    });
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(result.current).toBe("dark");
  });
});

describe("locale", () => {
  it("detects zh variants as zh-HK and everything else as English", () => {
    expect(detectLocale(["zh-HK"])).toBe("zh-HK");
    expect(detectLocale(["en-GB", "zh-Hant-HK"])).toBe("zh-HK");
    expect(detectLocale(["en-US"])).toBe("en");
    expect(detectLocale([])).toBe("en");
  });

  it("remembers a choice on this device and picks strings for it", async () => {
    function Probe(): React.ReactElement {
      const { locale, setLocale, t } = useLocale();
      return <button type="button" onClick={() => setLocale(locale === "en" ? "zh-HK" : "en")}>{t({ en: "Budget", zh: "預算" })}</button>;
    }
    const { unmount } = render(<LocaleProvider><Probe /></LocaleProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Budget" }));
    expect(screen.getByRole("button", { name: "預算" })).toBeInTheDocument();
    expect(window.localStorage.getItem("wally:lang")).toBe("zh-HK");
    unmount();
    render(<LocaleProvider><Probe /></LocaleProvider>);
    expect(screen.getByRole("button", { name: "預算" })).toBeInTheDocument();
  });
});

describe("roving focus", () => {
  it("wraps arrows and jumps with Home and End; ignores other keys", () => {
    expect(nextIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextIndex("Home", 2, 3)).toBe(0);
    expect(nextIndex("End", 0, 3)).toBe(2);
    expect(nextIndex("ArrowDown", 0, 3, "vertical")).toBe(1);
    expect(nextIndex("ArrowDown", 0, 3)).toBeNull();
    expect(nextIndex("a", 0, 3)).toBeNull();
    expect(nextIndex("Home", 0, 0)).toBeNull();
  });
});

describe("haptics", () => {
  it("vibrates with the named pattern where supported", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    expect(haptic("success")).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([...HAPTIC_PATTERNS.success]);
  });

  it("does nothing under reduced motion or without the Vibration API (iOS)", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    setQuery("(prefers-reduced-motion: reduce)", true);
    expect(haptic("stop")).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
    vi.stubGlobal("navigator", { ...navigator, vibrate: undefined });
    expect(haptic("tap")).toBe(false);
  });
});
