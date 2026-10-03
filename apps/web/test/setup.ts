// jsdom test setup: jest-dom matchers, explicit cleanup, and a controllable matchMedia (jsdom has none).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { ONBOARDED_KEY, profileStore } from "../src/state/profile";
import { resetPressTracking } from "../src/ui/hooks/usePressGuard";

// The first run (src/screens/onboarding) is off for every test, so existing tests see the app as they always did. The
// flag is set before each test and put back whenever a test clears storage to start as a fresh visitor. A test of the
// first run turns it on by removing the flag after that clear: window.localStorage.removeItem(ONBOARDED_KEY).
// (Some tests run in the node environment, where there is no storage at all.)
const hasStorage = typeof Storage !== "undefined" && typeof window !== "undefined";
if (hasStorage) {
  const clearStorage = Storage.prototype.clear;
  Storage.prototype.clear = function clear(this: Storage): void {
    clearStorage.call(this);
    if (this === window.localStorage) this.setItem(ONBOARDED_KEY, "1");
  };
}

export interface MediaState {
  reducedMotion: boolean;
}

const media: MediaState = { reducedMotion: false };

/** Tests flip this to emulate prefers-reduced-motion. */
export function setReducedMotion(on: boolean): void {
  media.reducedMotion = on;
}

beforeEach(() => {
  if (hasStorage) {
    profileStore.refresh(); // a test that made the page's storage fail must not leave its copy to the next
    window.localStorage.setItem(ONBOARDED_KEY, "1");
  }
  media.reducedMotion = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? media.reducedMotion : false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetPressTracking(); // a press one test left unfinished is not down in the next
});
