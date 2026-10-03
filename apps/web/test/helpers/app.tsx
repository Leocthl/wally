// Test harness: the real App on an instant MockApiClient (no timers, no network), driven the way a visitor would.
import { FakeClock } from "@wally/core/testing";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import type { ReactElement } from "react";
import { expect } from "vitest";
import { App } from "../../src/App";
import { MockApiClient } from "../../src/api/MockApiClient";

export interface Harness {
  readonly api: MockApiClient;
  readonly clock: FakeClock;
  readonly user: UserEvent;
  readonly container: HTMLElement;
}

/** Waits until the screen for the current route has loaded (screens other than Budget are lazy chunks). */
export async function screenReady(): Promise<void> {
  await waitFor(() => expect(document.querySelector("[data-route-loading]")).toBeNull());
}

export async function bootApp(hash = "#/booth", stored: Readonly<Record<string, string>> = {}): Promise<Harness> {
  // A fresh visitor: no remembered language or theme from an earlier test. `stored` is what a returning visitor already has.
  window.localStorage.clear();
  for (const [key, value] of Object.entries(stored)) window.localStorage.setItem(key, value);
  window.location.hash = hash;
  const clock = new FakeClock();
  const api = new MockApiClient({ clock, sleep: async () => undefined, pace: 0 });
  const user = userEvent.setup();
  const { container } = render(<App api={api} /> as ReactElement);
  // The preset mandate is sealed on load (docs/06). Every route shows the SIMULATED note in the top bar.
  await screen.findByRole("note");
  await waitFor(async () => expect((await api.snapshot()).mandate).not.toBeNull());
  await screenReady();
  return { api, clock, user, container };
}

/** Goes to a route the way a link would, and waits for its screen. */
export async function go(hash: string): Promise<void> {
  window.location.hash = hash;
  await waitFor(() => expect(window.location.hash.startsWith(hash.replace(/\?.*$/, ""))).toBe(true));
  await screenReady();
}

/** Presses a scenario card by its data attribute (labels change with the language, the id is stable). The cards live
 *  on Budget ("Try asking"); after a press the app shows Wally, so the next press goes back to Budget first. */
export async function press(h: Harness, id: string): Promise<void> {
  const find = (): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>(`[data-scenario="${id}"]`);
  if (!find()) await go("#/budget");
  const button = await waitFor(() => {
    const b = find();
    if (!b) throw new Error(`no scenario button ${id}`);
    expect(b).toBeEnabled();
    return b;
  });
  await h.user.click(button);
  await screenReady();
}
