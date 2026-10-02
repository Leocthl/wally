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
