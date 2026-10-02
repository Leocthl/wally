// Test harness: the real App on an instant MockApiClient (no timers, no network), driven the way a visitor would.
import { FakeClock } from "@laisee/core/testing";
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

export async function bootApp(hash = "#/booth"): Promise<Harness> {
  window.location.hash = hash;
  const clock = new FakeClock();
  const api = new MockApiClient({ clock, sleep: async () => undefined, pace: 0 });
  const user = userEvent.setup();
  const { container } = render(<App api={api} /> as ReactElement);
  // The preset mandate is sealed on load (docs/06). Every route renders the rail badge, so wait for both.
  await screen.findByRole("note");
  await waitFor(async () => expect((await api.snapshot()).mandate).not.toBeNull());
  return { api, clock, user, container };
}

/** Presses a scenario button by its data attribute (labels are bilingual, the id is stable). */
export async function press(h: Harness, id: string): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>(`[data-scenario="${id}"]`);
  if (!button) throw new Error(`no scenario button ${id}`);
  await h.user.click(button);
}
