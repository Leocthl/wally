// Opens the screens of a test in developer mode the way a demo link does (`?dev=1`), because plain is the default and the
// tests that pin hashes, rule ids and raw codes are about the developer view. The address goes back to the root after
// every test, so one test never leaks its mode into the next. `bootApp` clears storage, which is why this uses the address.
import { afterEach, beforeEach } from "vitest";

export function developerMode(): void {
  window.history.replaceState(null, "", `/?dev=1${window.location.hash}`);
}

/** Every test in the file runs in developer mode. */
export function developerModeForFile(): void {
  beforeEach(developerMode);
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
});
