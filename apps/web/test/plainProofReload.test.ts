// @vitest-environment node
// A page that loads while the tamper demo's changed copy is up (a reload, the next visitor) must come up with the right
// state on every client: the copy in `shown`, what changed in `tampered`, and the STORED receipts in `entries` (every
// client's view of the log carries the copy in `entries`, so the stored log is recovered from the copy and the change).
// Without that, Budget, Wally and the Presenter would show the changed amount with nothing saying so.
import { FakeClock } from "@wally/core/testing";
import type { LogEntry } from "@wally/core/generated";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpApp } from "../server/app";
import { SseHub } from "../server/http/sse";
import { HttpApiClient } from "../src/api/http/HttpApiClient";
import { LocalApiClient } from "../src/api/local/LocalApiClient";
import { MockApiClient } from "../src/api/MockApiClient";
import { m0SealRequest } from "../src/api/mock/presets";
import type { ApiClient, LogView } from "../src/api/types";
import { fromSnapshot } from "../src/state/booth";
import { storedEntries } from "../src/state/storedEntries";
import { listen } from "./server/support/listen";
import { mockBackend } from "./server/support/mockBackend";
import { bootReal, orchestratorIsReal } from "./server/support/realStack";

interface Rig {
  readonly client: ApiClient;
  close(): Promise<void>;
}

const open: Rig[] = [];
afterEach(async () => {
  for (const rig of open.splice(0)) await rig.close();
});

async function mock(): Promise<Rig> {
  const client = new MockApiClient({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
  await client.seal(m0SealRequest(new Date()));
  return { client, close: async () => undefined };
}

async function local(): Promise<Rig> {
  const client = new LocalApiClient({ tickMs: null });
  await client.seal(m0SealRequest(new Date()));
  return { client, close: async () => client.dispose() };
}

/** The booth server's routes on a loopback port; the backend is the offline mock behind the server's own interface. */
async function http(): Promise<Rig> {
  const hub = new SseHub({ keepAliveMs: 15_000, maxQueuedChunks: 1024 });
  const { backend, mock: inner } = mockBackend();
  inner.subscribe((e) => hub.publish(e));
  const server = await listen(createHttpApp({ backend: () => backend, hub }));
  const client = new HttpApiClient({ baseUrl: server.baseUrl });
  await client.seal(m0SealRequest(new Date()));
  return {
    client,
    close: async () => {
      client.dispose();
      hub.close();
      await server.close();
    },
  };
}

/** The booth server itself: the composed app (routes, real orchestrator, signed log, seeded rail) on a loopback port. It seals M0 when it starts. */
async function realServer(): Promise<Rig> {
  const booth = await bootReal();
  const server = await listen(booth.app);
  const client = new HttpApiClient({ baseUrl: server.baseUrl });
  return {
    client,
    close: async () => {
      client.dispose();
      await server.close();
      await booth.close();
    },
  };
}

const REAL = await orchestratorIsReal();
const RIGS: readonly (readonly [string, () => Promise<Rig>])[] = [
  ["MockApiClient", mock],
  ["LocalApiClient (the backend the booth server runs)", local],
  ["HttpApiClient (the booth routes over loopback)", http],
  ...(REAL ? ([["the booth server on the real stack, through HttpApiClient", realServer]] as const) : []),
];

const totalOf = (entry: LogEntry | undefined): unknown => (entry?.kind === "DECISION" ? entry.payload.cart.total_minor : undefined);

describe.each(RIGS)("%s", (_name, make) => {
  it("hands a page that loads during the demo the copy, what changed and the stored receipts", async () => {
    const rig = await make();
    open.push(rig);
    const { client } = rig;
    await client.runScenario("normal");
    const stored = (await client.getLog()).entries;
    expect(totalOf(stored[1])).toBe(25_900);
    await client.tamper();

    const snapshot = await client.snapshot();
    expect(snapshot.log.tampered).toMatchObject({ seq: 1, field: "cart.total_minor", before: 25_900, after: 35_900 });
    expect(totalOf(snapshot.log.entries[1])).toBe(35_900);

    const state = fromSnapshot(snapshot);
    expect(state.log.tampered).toEqual(snapshot.log.tampered);
    expect(totalOf(state.log.shown[1])).toBe(35_900);
    expect(state.log.shown).toEqual(snapshot.log.entries);
    expect(state.log.entries).toEqual(stored);
    expect(totalOf(state.log.entries[1])).toBe(25_900);
    expect(state.log.head).toEqual(snapshot.log.head);
    expect(state.log.entries.at(-1)?.entry_hash).toBe(state.log.head?.entry_hash);
  });

  it("hands a page that loads after the original was put back the stored receipts everywhere", async () => {
    const rig = await make();
    open.push(rig);
    const { client } = rig;
    await client.runScenario("normal");
    const stored = (await client.getLog()).entries;
    await client.tamper();
    await client.restore();
    const state = fromSnapshot(await client.snapshot());
    expect(state.log.tampered).toBeNull();
    expect(state.log.entries).toEqual(stored);
    expect(state.log.shown).toEqual(stored);
  });

  it("hands a page that loads with no demo going the log as it is", async () => {
    const rig = await make();
    open.push(rig);
    await rig.client.runScenario("normal");
    const view = await rig.client.getLog();
    const state = fromSnapshot(await rig.client.snapshot());
    expect(state.log.entries).toEqual(view.entries);
    expect(state.log.shown).toEqual(view.entries);
    expect(state.log.tampered).toBeNull();
  });
});

describe("storedEntries", () => {
  const entry = (seq: number, total: number): LogEntry =>
    ({ seq, kind: "DECISION", payload: { id: `dec_${seq}`, cart: { total_minor: total, items: [] } } }) as unknown as LogEntry;
  const copyOf = (entries: readonly LogEntry[], patch: Partial<NonNullable<LogView["tampered"]>> = {}): Pick<LogView, "entries" | "tampered"> => ({
    entries,
    tampered: { seq: 1, field: "cart.total_minor", before: 25_900, after: 35_900, ...patch },
  });

  it("puts the changed number back in the one receipt, leaving the others and the input alone", () => {
    const view = copyOf([entry(0, 100), entry(1, 35_900), entry(2, 700)]);
    const frozen = JSON.stringify(view);
    const back = storedEntries(view);
    expect(totalOf(back[1])).toBe(25_900);
    expect(back[0]).toBe(view.entries[0]);
    expect(back[2]).toBe(view.entries[2]);
    expect(JSON.stringify(view)).toBe(frozen);
  });

  it("returns the view's own entries when it is not a view of a copy", () => {
    const entries = [entry(0, 100)];
    expect(storedEntries({ entries, tampered: null })).toBe(entries);
  });

  it("guesses nothing when the view does not describe the change it claims", () => {
    const entries = [entry(0, 100), entry(1, 35_900)];
    expect(storedEntries(copyOf(entries, { after: 41_000 }))).toBe(entries);
    expect(storedEntries(copyOf(entries, { field: "cart.nope" }))).toBe(entries);
    expect(storedEntries(copyOf(entries, { seq: 9 }))).toBe(entries);
    expect(storedEntries(copyOf(entries, { field: "" }))).toBe(entries);
  });
});
