// jsdom test setup: jest-dom matchers, explicit cleanup, and a controllable matchMedia (jsdom has none).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

export interface MediaState {
  reducedMotion: boolean;
}

const media: MediaState = { reducedMotion: false };

/** Tests flip this to emulate prefers-reduced-motion. */
export function setReducedMotion(on: boolean): void {
  media.reducedMotion = on;
}

beforeEach(() => {
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
});
