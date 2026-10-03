// When the demo scenarios are open on Home. A shopper sees them closed. The booth Mac (a loopback address), a ?booth=1 link and
// presenter mode see them open, so the stage and the booth need no extra tap. Opening or closing them is remembered for this
// browser (localStorage, never an error when storage is refused). Pure helpers plus a hook; the helpers take everything they read.
import { useCallback, useState } from "react";
import { isNative } from "../../pwa/native";

export const DEMO_OPEN_KEY = "wally:demo-open";
/**
 * The key presenter mode sets (the display-mode switch writes "1"). Read here so the stage opens the demo scenarios without a
 * tap; if the switch is kept somewhere else when the lanes meet, this is the one line that follows it.
 */
export const PRESENTER_KEY = "wally:presenter";

export interface DemoEnv {
  readonly hostname: string;
  /** location.search */
  readonly search: string;
  /** location.hash */
  readonly hash: string;
  /** Inside the iOS or Android app, whose own address is localhost: that is not the booth Mac. */
  readonly native: boolean;
  readonly presenter: boolean;
  /** The person's own choice from an earlier visit, or null. */
  readonly stored: boolean | null;
}

/** localhost, the whole 127.x range, ::1, and *.localhost: the machine the page is served from. */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" || host.endsWith(".localhost") || /^127(\.\d{1,3}){3}$/.test(host);
}

/** ?booth=1 in the address, or in the hash route's own query (#/budget?booth=1). Only the value 1 counts. */
export function boothFlag(search: string, hash: string): boolean {
  const inSearch = new URLSearchParams(search).get("booth") === "1";
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  return inSearch || new URLSearchParams(query).get("booth") === "1";
}

/**
 * Whether the demo scenarios start open. A ?booth=1 link and presenter mode always open them (the stage must not depend on
 * what was chosen before); otherwise the person's own choice wins; with none, only the booth Mac opens them.
 */
export function demoDefaultOpen(env: DemoEnv): boolean {
  if (boothFlag(env.search, env.hash) || env.presenter) return true;
  if (env.stored !== null) return env.stored;
  return !env.native && isLoopbackHost(env.hostname);
}

/**
 * Whether this page is the booth's: the booth Mac (a loopback address, outside the native apps), a ?booth=1 link, or presenter
 * mode. Only there is the disclosure "for judges"; on anyone else's phone the same cards are simply a demo.
 */
export function isBoothPage(env: DemoEnv): boolean {
  return boothFlag(env.search, env.hash) || env.presenter || (!env.native && isLoopbackHost(env.hostname));
}

/** The slice of Storage these helpers use. */
export interface ChoiceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readStoredChoice(storage: Pick<ChoiceStorage, "getItem"> | null): boolean | null {
  try {
    const raw = storage?.getItem(DEMO_OPEN_KEY) ?? null;
    return raw === "1" ? true : raw === "0" ? false : null;
  } catch {
    return null;
  }
}

export function rememberChoice(open: boolean, storage: Pick<ChoiceStorage, "setItem"> | null): void {
  try {
    storage?.setItem(DEMO_OPEN_KEY, open ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

function pageStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function presenterMode(storage: Pick<ChoiceStorage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(PRESENTER_KEY) === "1";
  } catch {
    return false;
  }
}

/** True on the booth's own pages (see isBoothPage), read once when Home opens. */
export function useIsBoothPage(): boolean {
  return useState(() => isBoothPage(readDemoEnv()))[0];
}

/** The page as it is now, read once when Home opens. */
export function readDemoEnv(): DemoEnv {
  if (typeof window === "undefined") return { hostname: "", search: "", hash: "", native: false, presenter: false, stored: null };
  const storage = pageStorage();
  return { hostname: window.location.hostname, search: window.location.search, hash: window.location.hash, native: isNative(), presenter: presenterMode(storage), stored: readStoredChoice(storage) };
}

/** Open or closed, and the way to change it (which is remembered). */
export function useDemoOpen(): readonly [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => demoDefaultOpen(readDemoEnv()));
  const choose = useCallback((next: boolean) => {
    setOpen(next);
    rememberChoice(next, pageStorage());
  }, []);
  return [open, choose];
}
