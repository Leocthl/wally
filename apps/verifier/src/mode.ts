// Display mode: `plain` (the default) says what happened in everyday words; `developer` is the page as engineers know it,
// with receipt ids, hashes and the exact codes. The same rules as the Wally app (apps/web/src/state/displayMode.ts): the
// address can force a mode for one page load (`?dev=1` developer, `?dev=0` plain), else a remembered choice wins, else plain.
// The choice is kept under the key the app uses, so on the app's origin (/verifier/) the two share it. Every storage and
// history access is guarded: private mode, a webview or file:// must never break the page, the choice then lasts until
// it is closed. The mode in force lives on <html data-mode>, the way the language lives on data-lang.
export type Mode = "plain" | "developer";

/** The key the Wally app uses too. */
export const MODE_KEY = "wally:mode";
const OVERRIDE_PARAM = "dev";

function asMode(value: unknown): Mode | null {
  return value === "plain" || value === "developer" ? value : null;
}

/** `?dev=1` is developer, `?dev=0` is plain; a missing parameter or any other value is no override. */
export function modeFromSearch(search: string): Mode | null {
  const value = new URLSearchParams(search).get(OVERRIDE_PARAM);
  return value === "1" ? "developer" : value === "0" ? "plain" : null;
}

function currentSearch(): string {
  try {
    return window.location.search;
  } catch {
    return "";
  }
}

export function readStoredMode(): Mode | null {
  try {
    return asMode(window.localStorage.getItem(MODE_KEY));
  } catch {
    return null;
  }
}

/** True when the choice was kept; a blocked or full store gives false and the choice lasts for this page only. */
export function storeMode(mode: Mode): boolean {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

/** The address first, then what this device remembers, then plain. */
export function initialMode(): Mode {
  return modeFromSearch(currentSearch()) ?? readStoredMode() ?? "plain";
}

/** Switches the page: data-mode tells the rest of the page (and the tests) which mode is drawn. */
export function applyMode(mode: Mode, root: HTMLElement = document.documentElement): void {
  root.dataset["mode"] = mode;
}

export function currentMode(root: HTMLElement = document.documentElement): Mode {
  return asMode(root.dataset["mode"]) ?? "plain";
}

/** Takes `dev` out of the address (other parameters and the hash stay) so it never contradicts the switch. */
function clearOverride(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(OVERRIDE_PARAM)) return;
    url.searchParams.delete(OVERRIDE_PARAM);
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    // An address that cannot be rewritten (a file:// page can throw a SecurityError here): the override simply stays.
  }
}

/** What the switch does: remember the choice, drop a stale `?dev`, and apply it. */
export function chooseMode(mode: Mode): void {
  storeMode(mode);
  clearOverride();
  applyMode(mode);
}
