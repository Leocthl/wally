// A page left open while the booth restarted (or the phone slept) keeps what it last heard. When the live connection comes back
// the page reads the booth again, shows what it says, and takes away the "could not be reached" message it left; a message that
// is a refusal is still true and stays. A booth still out of reach changes nothing and adds no message.
import { FakeClock } from "@wally/core/testing";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MockApiClient } from "../src/api/MockApiClient";
import { ApiRequestError } from "../src/api/http/errors";
import type { ApiKind, BoothSnapshot, Unsubscribe } from "../src/api/types";
import { m0Request } from "../src/booth/compile";
import { BoothProvider, useBoothContext, type Booth } from "../src/hooks/useBooth";

/** A booth whose connection the test can break and restore, and whose snapshot it can change behind the page's back. */
class Flaky extends MockApiClient {
  readonly #back = new Set<() => void>();
  replacement: BoothSnapshot | null = null;
  snapshotFails = false;
  snapshots = 0;

  constructor(kind: ApiKind = "http") {
    super({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
    // The mock stands in for a live booth: only the kind differs (what decides whether a waking phone reads the booth again).
    Object.defineProperty(this, "kind", { value: kind });
  }

  override async snapshot(): Promise<BoothSnapshot> {
    this.snapshots += 1;
    if (this.snapshotFails) throw new ApiRequestError(0, "NETWORK", "The booth server cannot be reached.");
    return this.replacement ?? super.snapshot();
  }

  onReconnect(listener: () => void): Unsubscribe {
    this.#back.add(listener);
    return () => void this.#back.delete(listener);
  }

  reconnect(): void {
    for (const listener of this.#back) listener();
  }
}

let booth: Booth | null = null;
function Probe(): React.ReactElement {
  booth = useBoothContext();
  const { info, state, error } = booth;
  return (
    <div>
      <p data-testid="budget">{info === null ? "loading" : state.packet === null ? "none" : String(state.packet.budget_minor)}</p>
      <p data-testid="error">{error ?? "no error"}</p>
    </div>
  );
}

const open = async (api: Flaky) => {
  render(<BoothProvider api={api}><Probe /></BoothProvider>);
  await waitFor(() => expect(screen.getByTestId("budget")).toHaveTextContent("80000"));
};

/** The booth as it is after a restart: a new log, a smaller budget. */
async function restarted(api: Flaky): Promise<BoothSnapshot> {
  const other = new MockApiClient({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
  const request = m0Request(new Date("2026-10-03T03:00:00Z"));
  await other.seal({ ...request, rules: { ...request.rules, budget: { ...request.rules.budget, amount_minor: 30_000 } } });
  await other.seal({ ...request, rules: { ...request.rules, budget: { ...request.rules.budget, amount_minor: 30_000 } } });
  const snap = await other.snapshot();
  expect(snap.packet?.log_id).not.toBe((await api.snapshot()).packet?.log_id);
  return snap;
}

describe("a page left open while the booth restarted", () => {
  it("shows the booth as it is now once the connection is back", async () => {
    const api = new Flaky();
    await open(api);
    api.replacement = await restarted(api);
    act(() => api.reconnect());
    await waitFor(() => expect(screen.getByTestId("budget")).toHaveTextContent("30000"));
  });

  it("takes away the 'could not be reached' message the outage left", async () => {
    const api = new Flaky();
    await open(api);
    await act(() => booth?.exec(() => Promise.reject(new ApiRequestError(0, "NETWORK", "The booth server cannot be reached."))) ?? Promise.resolve());
    expect(screen.getByTestId("error")).toHaveTextContent("The booth server cannot be reached.");
    act(() => api.reconnect());
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("no error"));
  });

  it("keeps a message that is a refusal: the booth did answer, and it said no", async () => {
    const api = new Flaky();
    await open(api);
    await act(() => booth?.exec(() => Promise.reject(new ApiRequestError(409, "EXCEEDS_PARENT", "That is more than Mum allows."))) ?? Promise.resolve());
    act(() => api.reconnect());
    await waitFor(() => expect(api.snapshots).toBeGreaterThan(1));
    expect(screen.getByTestId("error")).toHaveTextContent("That is more than Mum allows.");
  });

  it("changes nothing and adds no message when the booth is still out of reach", async () => {
    const api = new Flaky();
    await open(api);
    api.snapshotFails = true;
    const before = api.snapshots;
    act(() => api.reconnect());
    await waitFor(() => expect(api.snapshots).toBeGreaterThan(before));
    expect(screen.getByTestId("budget")).toHaveTextContent("80000");
    expect(screen.getByTestId("error")).toHaveTextContent("no error");
  });

  it("reads the booth again when the phone wakes up or comes back online (live booths only)", async () => {
    const api = new Flaky("http");
    await open(api);
    const before = api.snapshots;
    api.replacement = await restarted(api);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(screen.getByTestId("budget")).toHaveTextContent("30000"));
    expect(api.snapshots).toBeGreaterThan(before);
  });

  it("does not re-read a booth that lives in the page (mock and on-device have no connection to lose)", async () => {
    const api = new Flaky("mock");
    await open(api);
    const before = api.snapshots;
    act(() => void window.dispatchEvent(new Event("online")));
    await new Promise((r) => setTimeout(r, 50));
    expect(api.snapshots).toBe(before);
  });
});
