// Media-query hooks for the Wally UI: one subscription per query through useSyncExternalStore, safe where matchMedia
// is missing (old browsers, some test environments), where they report false.
import { useSyncExternalStore } from "react";

function supported(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (!supported()) return () => undefined;
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => (supported() ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/**
 * Where the phone column gives way to the laptop layout: top navigation instead of the tab bar, a wide page, side drawers instead of
 * bottom sheets. The same widths are written in shell.css, home.css and overlay.css (a media query cannot read a variable), so a
 * change here is a change there. Rems, so a larger browser font moves the breakpoints with it.
 */
export const DESKTOP_QUERY = "(min-width: 64rem)";
/** Room for three columns on the Budget screen. */
export const WIDE_QUERY = "(min-width: 78rem)";

/** True on a laptop or desktop window. False where matchMedia is missing: the phone layout is the safe default. */
export function useDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}

/** True when the Budget screen has its three columns. */
export function useWide(): boolean {
  return useMediaQuery(WIDE_QUERY);
}

export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
export const DARK_SCHEME = "(prefers-color-scheme: dark)";
export const STANDALONE = "(display-mode: standalone)";

export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION);
}

/** True when the page runs as an installed app (Android/desktop display-mode, or iOS navigator.standalone). */
export function useStandalone(): boolean {
  const displayMode = useMediaQuery(STANDALONE);
  const ios = typeof navigator !== "undefined" && (navigator as Navigator & { readonly standalone?: boolean }).standalone === true;
  return displayMode || ios;
}
