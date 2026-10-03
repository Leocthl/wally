// Test harness for the first run: the real App on an instant mock, as a visitor who has never been here. The suite's setup
// turns the first run off for every test (the flag in storage); this puts it back on for the test that asks.
import { FakeClock } from "@wally/core/testing";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import type { ReactElement } from "react";
import { expect } from "vitest";
import { App, type AppProps } from "../../src/App";
import { MockApiClient } from "../../src/api/MockApiClient";
import type { ApiClient, ApiInfo } from "../../src/api/types";
import { m0Request } from "../../src/booth/compile";
import { ONBOARDED_KEY, PROFILE_KEY } from "../../src/state/profile";

export const instantMock = (): MockApiClient => new MockApiClient({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });

/** The offline mock that says the booth offers family budgets (the Seal screen's own switch). */
export class FamilyMock extends MockApiClient {
  constructor() {
    super({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
  }

  override async info(): Promise<ApiInfo> {
    const info = await super.info();
    return { ...info, features: { ...info.features, family: true } };
  }

  async family() {
    return {
      parent: "mum" as const,
      mandateId: "mnd_mumP0001",
      issuer: "did:key:z6MkMumKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      ceilingMinor: 100_000,
      allocatedMinor: 0,
      remainingMinor: 100_000,
      validUntil: "2026-10-31T15:59:59Z",
      categories: ["apparel"],
      verifiedSellersOnly: true,
    };
  }
}

export interface FirstRun {
  readonly api: ApiClient;
  readonly user: UserEvent;
}

export interface FirstRunOptions {
  readonly api?: ApiClient;
  readonly hash?: string;
  /** Storage as it is when the page opens (a profile from an earlier visit, a language). */
  readonly stored?: Readonly<Record<string, string>>;
  /** The booth already holds a budget, as the live booth server does. */
  readonly sealed?: boolean;
  readonly app?: Partial<AppProps>;
}

/** A visitor with no flag opens the app. Nothing is awaited: the first screen is the test's to find. */
export async function openFirstRun(options: FirstRunOptions = {}): Promise<FirstRun> {
  window.localStorage.clear();
  window.localStorage.removeItem(ONBOARDED_KEY);
  for (const [key, value] of Object.entries(options.stored ?? {})) window.localStorage.setItem(key, value);
  window.location.hash = options.hash ?? "#/budget";
  const api = options.api ?? instantMock();
  if (options.sealed === true) await api.seal(m0Request(new Date()));
  const user = userEvent.setup();
  render(<App api={api} {...options.app} /> as ReactElement);
  return { api, user };
}

export const hello = (): Promise<HTMLElement> => screen.findByRole("heading", { level: 1, name: "Hi, I'm Wally." });
/** Step two, "What can Wally buy for you?": the four kinds of purchase, all ticked to start with. */
export const BUY_TITLE = "What can Wally buy for you?";
export const buyStep = (): Promise<HTMLElement> => screen.findByRole("heading", { level: 1, name: BUY_TITLE });
/** The kinds on step two, in the order the step lists them, by the names it gives them. */
export const BUY_KINDS = ["Groceries and food", "Clothes", "Shoes", "Gadgets and electronics"] as const;
/** The chip of one kind on step two (the budget form on step three has chips of its own, named a little differently). */
export const kindChip = (name: (typeof BUY_KINDS)[number]): HTMLElement => screen.getByRole("button", { name });
export const skip = (): HTMLElement => screen.getByRole("button", { name: "Skip" });
export const tourCard = (): Promise<HTMLElement> => screen.findByRole("dialog", { name: /Ask Wally|Ideas for you|Find your way/ });
export const storedProfile = (): unknown => JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? "null");

/** Presses Skip on the step in front and waits for the first coach mark: the judge's two taps, the first of them. */
export async function skipToTour(user: UserEvent): Promise<void> {
  await user.click(skip());
  await tourCard();
}

export async function skipTour(user: UserEvent): Promise<void> {
  await user.click(await screen.findByRole("button", { name: "Skip tour" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

