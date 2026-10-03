// Display mode: how much of the machinery the app shows. `plain` is the default for everyone, on every host; `developer`
// is today's screens with their hashes, rule ids, intervals and raw codes. The choice is made with the switch in About
// ("Show technical details"), remembered on this device under wally:mode, and can be forced for one page load with
// `?dev=1` (developer) or `?dev=0` (plain) so a demo link opens the right view without touching anyone's settings.
//
// A module-level store read with useSyncExternalStore: no provider, so every screen asks for the mode the same way and
// all of them follow one switch. Storage may be blocked (private mode, a webview): every access is guarded, and a choice
// made while it is blocked still holds for this page.
import { useCallback, useSyncExternalStore } from "react";

export type DisplayMode = "plain" | "developer";

/** The key the offline verifier page reads too (it is served from the same origin at /verifier/). */
export const MODE_KEY = "wally:mode";
const MODE_EVENT = "wally:mode-change";
const OVERRIDE_PARAM = "dev";

export const isDisplayMode = (value: unknown): value is DisplayMode => value === "plain" || value === "developer";

/** `?dev=1` is developer, `?dev=0` is plain; a missing parameter or any other value is no override. */
export function modeFromSearch(search: string): DisplayMode | null {
  const value = new URLSearchParams(search).get(OVERRIDE_PARAM);
  return value === "1" ? "developer" : value === "0" ? "plain" : null;
}

function storedMode(): DisplayMode | null {
  try {
    const value = window.localStorage.getItem(MODE_KEY);
    return isDisplayMode(value) ? value : null;
  } catch {
    return null;
  }
}

/** A choice made while storage refused to keep it: it lasts until the page closes. */
let held: DisplayMode | null = null;

/** The mode in force now: the address first, then a choice storage would not keep, then what this device remembers, then plain. */
export function readDisplayMode(): DisplayMode {
  if (typeof window === "undefined") return "plain";
  return modeFromSearch(window.location.search) ?? held ?? storedMode() ?? "plain";
}

/** Takes `dev` out of the address (route and other parameters stay) so it never contradicts the switch. */
function clearOverride(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(OVERRIDE_PARAM)) return;
    url.searchParams.delete(OVERRIDE_PARAM);
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    // An address that cannot be rewritten (a restricted webview): the override simply stays.
  }
}

export function setDisplayMode(next: DisplayMode): void {
  if (typeof window === "undefined") return;
  held = null;
  try {
    window.localStorage.setItem(MODE_KEY, next);
  } catch {
    held = next;
  }
  clearOverride();
  window.dispatchEvent(new Event(MODE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === MODE_KEY) onChange();
  };
  window.addEventListener(MODE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MODE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const serverMode = (): DisplayMode => "plain";

/** The mode and a setter. Every component that calls it re-renders when the switch is flipped. */
export function useDisplayMode(): readonly [DisplayMode, (next: DisplayMode) => void] {
  const mode = useSyncExternalStore(subscribe, readDisplayMode, serverMode);
  const set = useCallback((next: DisplayMode) => setDisplayMode(next), []);
  return [mode, set];
}

/** True in developer mode: the one question most screens ask. */
export function useIsDeveloper(): boolean {
  return useSyncExternalStore(subscribe, readDisplayMode, serverMode) === "developer";
}
