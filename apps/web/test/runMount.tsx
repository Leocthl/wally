// Mounts the Wally screen alone (no app shell) on an instant MockApiClient with a FakeClock, the way the shell will:
// inside BoothProvider and LocaleProvider. `inject` plays hand-written TraceEvents (no proposal, errors, core-engine
// shaped decisions) through the same subscription the client uses.
import { FakeClock } from "@laisee/core/testing";
import { act, render, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { expect } from "vitest";
import type { ApiClient, ScenarioId, TraceEvent, TraceListener } from "../src/api/types";
import { MockApiClient } from "../src/api/MockApiClient";
import { BoothProvider } from "../src/hooks/useBooth";
import { RunScreen, type RunScreenProps } from "../src/screens/run/RunScreen";
import { LocaleProvider, type Locale } from "../src/ui/locale";

export interface Mounted {
  readonly mock: MockApiClient;
  readonly api: ApiClient;
  readonly clock: FakeClock;
  readonly user: UserEvent;
  readonly container: HTMLElement;
  /** The screen's own root (sheets portal to body, outside it). */
  root(): HTMLElement;
  run(id: ScenarioId): Promise<void>;
  inject(events: readonly TraceEvent[]): Promise<void>;
}

export interface MountOptions extends RunScreenProps {
  readonly locale?: Locale;
  readonly hash?: string;
  /** Extra client methods, e.g. suggestAlternatives (a later wave). */
  readonly extend?: Readonly<Record<string, unknown>>;
}

function wrap(mock: MockApiClient, listeners: Set<TraceListener>, extend: Readonly<Record<string, unknown>>): ApiClient {
  const base: ApiClient = {
    kind: "mock",
    info: () => mock.info(),
    snapshot: () => mock.snapshot(),
    seal: (r) => mock.seal(r),
    runScenario: (id) => mock.runScenario(id),
    propose: (r) => mock.propose(r),
    revoke: (r) => mock.revoke(r),
    answerEscalation: (r) => mock.answerEscalation(r),
    getLog: () => mock.getLog(),
    verify: () => mock.verify(),
    tamper: () => mock.tamper(),
    restore: () => mock.restore(),
    reset: () => mock.reset(),
    subscribe: (l) => {
      const off = mock.subscribe(l);
      listeners.add(l);
      return () => {
        off();
        listeners.delete(l);
      };
    },
  };
  return Object.assign(base, extend);
}

export async function mountRun(opts: MountOptions = {}): Promise<Mounted> {
  window.location.hash = opts.hash ?? "#/wally";
  const clock = new FakeClock();
  const mock = new MockApiClient({ clock, sleep: async () => undefined, pace: 0 });
  const listeners = new Set<TraceListener>();
  const api = wrap(mock, listeners, opts.extend ?? {});
  const user = userEvent.setup();
  const props: RunScreenProps = { now: opts.now ?? (() => clock.now().getTime()), ...(opts.onAsk ? { onAsk: opts.onAsk } : {}) };
  const { container } = render(
    <LocaleProvider locale={opts.locale ?? "en"}>
      <BoothProvider api={api}>
        <RunScreen {...props} />
      </BoothProvider>
    </LocaleProvider>,
  );
  await waitFor(async () => expect((await mock.snapshot()).mandate).not.toBeNull());
  const root = (): HTMLElement => {
    const el = container.querySelector<HTMLElement>('[data-screen="wally"]');
    if (!el) throw new Error("the Wally screen is not mounted");
    return el;
  };
  return {
    mock,
    api,
    clock,
    user,
    container,
    root,
    run: async (id) => {
      clock.advance(1000);
      await act(async () => {
        await mock.runScenario(id);
      });
    },
    inject: async (events) => {
      await act(async () => {
        for (const e of events) for (const l of listeners) l(e);
      });
    },
  };
}
