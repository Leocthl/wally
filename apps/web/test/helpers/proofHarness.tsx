// Mounts a b-proof screen on its own (no shell): the real BoothProvider on an instant MockApiClient, seeded by running
// scenarios first, in a fixed language. Lets Receipts and Proof be tested before the new shell lands.
import { FakeClock } from "@laisee/core/testing";
import { render, waitFor, type RenderResult } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import type { ReactElement } from "react";
import { expect } from "vitest";
import { MockApiClient } from "../../src/api/MockApiClient";
import type { ApiClient, BoothSnapshot, ScenarioId } from "../../src/api/types";
import { m0Request } from "../../src/booth/compile";
import { BoothProvider } from "../../src/hooks/useBooth";
import { LocaleProvider, type Locale } from "../../src/ui/locale";

export type SeedStep = ScenarioId | "REVOKE";

export function instantMock(): { readonly api: MockApiClient; readonly clock: FakeClock } {
  const clock = new FakeClock();
  return { api: new MockApiClient({ clock, sleep: async () => undefined, pace: 0 }), clock };
}

export async function seed(api: MockApiClient, clock: FakeClock, steps: readonly SeedStep[]): Promise<void> {
  await api.seal(m0Request(clock.now()));
  for (const step of steps) {
    if (step === "REVOKE") await api.revoke();
    else await api.runScenario(step);
  }
}

const EMPTY: BoothSnapshot = { mandate: null, intentText: null, packet: null, cards: [], log: { entries: [], head: null, tampered: null }, escalations: [] };
const nope = async (): Promise<never> => {
  throw new Error("not in this test");
};

/** A client with an empty log that never seals: for empty states. Override any call. */
export function emptyClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    kind: "mock",
    info: async () => ({ kind: "mock", judge: { provider: "replay", note: "test" }, planner: { provider: "replay", note: "test" }, replayed: true, realCapture: null }),
    snapshot: async () => EMPTY,
    seal: nope,
    runScenario: nope,
    propose: nope,
    revoke: nope,
    answerEscalation: nope,
    getLog: async () => EMPTY.log,
    verify: nope,
    tamper: nope,
    restore: nope,
    reset: async () => undefined,
    subscribe: () => () => undefined,
    ...overrides,
  };
}

/** The same client with some calls replaced (an HTTP kind, a verify outcome, an export). Methods stay bound. */
export function delegate(api: ApiClient, overrides: Partial<ApiClient> & Readonly<Record<string, unknown>> = {}): ApiClient {
  const bound: ApiClient = {
    kind: api.kind,
    info: () => api.info(),
    snapshot: () => api.snapshot(),
    seal: (r) => api.seal(r),
    runScenario: (id) => api.runScenario(id),
    propose: (r) => api.propose(r),
    revoke: (r) => api.revoke(r),
    answerEscalation: (r) => api.answerEscalation(r),
    getLog: () => api.getLog(),
    verify: () => api.verify(),
    tamper: () => api.tamper(),
    restore: () => api.restore(),
    reset: () => api.reset(),
    subscribe: (l) => api.subscribe(l),
  };
  return { ...bound, ...overrides } as ApiClient;
}

/** Mounts without waiting for a sealed mandate (empty states). */
export function mountBare(ui: ReactElement, api: ApiClient, locale: Locale = "en"): RenderResult {
  return render(
    <LocaleProvider locale={locale}>
      <BoothProvider api={api}>{ui}</BoothProvider>
    </LocaleProvider>,
  );
}

export interface Mounted extends RenderResult {
  readonly user: UserEvent;
}

export async function mountScreen(ui: ReactElement, api: ApiClient, opts: { readonly locale?: Locale; readonly hash?: string } = {}): Promise<Mounted> {
  window.location.hash = opts.hash ?? "#/receipts";
  const user = userEvent.setup();
  const view = render(
    <LocaleProvider locale={opts.locale ?? "en"}>
      <BoothProvider api={api}>{ui}</BoothProvider>
    </LocaleProvider>,
  );
  await waitFor(async () => expect((await api.snapshot()).mandate).not.toBeNull());
  return { ...view, user };
}
