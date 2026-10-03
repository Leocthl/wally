// The client side of private practice wallets. A browser page needs nothing: its wallet id is an HttpOnly cookie. The
// native shells and scripts cannot keep one, so they read the id from the X-Wally-Session header of an answer, keep it
// beside the pairing token, and send it back on every request, the event stream and the start-up probe included.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearConnection,
  readSessionId,
  saveConnection,
  saveSessionId,
  SERVER_KEY,
  SESSION_HEADER,
  WALLET_KEY,
  sessionAware,
  TOKEN_KEY,
  type ConnectionStores,
} from "../src/api/http/connection";
import { HttpApiClient } from "../src/api/http/HttpApiClient";
import { probeInfo } from "../src/api/local/select";

const TOKEN = "0123456789abcdef0123456789abcdef";
const ID_A = "a".repeat(32);
const ID_B = "b".repeat(32);

function fakeStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}
const fakeStores = (local: Record<string, string> = {}, session: Record<string, string> = {}) => {
  const l = fakeStore(local);
  const s = fakeStore(session);
  return { l, s, stores: { local: l, session: s } satisfies ConnectionStores };
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const answer = (id: string | null, body: unknown = { ok: true }): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...(id === null ? {} : { [SESSION_HEADER]: id }) } });

describe("the stored wallet id", () => {
  it("is read from session storage first, then local storage, and a malformed value is ignored", () => {
    expect(readSessionId(fakeStores({ [WALLET_KEY]: ID_A }, { [WALLET_KEY]: ID_B }).stores)).toBe(ID_B);
    expect(readSessionId(fakeStores({ [WALLET_KEY]: ID_A }).stores)).toBe(ID_A);
    expect(readSessionId(fakeStores({ [WALLET_KEY]: "not-an-id" }).stores)).toBeNull();
    expect(readSessionId(fakeStores().stores)).toBeNull();
    expect(readSessionId({ local: null, session: null })).toBeNull();
  });

  it("is saved beside the pairing token: local storage in the native shell, session storage in a page", () => {
    const native = fakeStores({ [TOKEN_KEY]: TOKEN });
    saveSessionId(ID_A, native.stores);
    expect(native.l.data.get(WALLET_KEY)).toBe(ID_A);
    expect(native.s.data.has(WALLET_KEY)).toBe(false);
    const page = fakeStores({}, { [TOKEN_KEY]: TOKEN });
    saveSessionId(ID_A, page.stores);
    expect(page.s.data.get(WALLET_KEY)).toBe(ID_A);
    expect(page.l.data.has(WALLET_KEY)).toBe(false);
  });

  it("saves nothing that is not an id, and survives storage that throws", () => {
    const { l, s, stores } = fakeStores();
    saveSessionId("../../x", stores);
    expect(l.data.size + s.data.size).toBe(0);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(() => saveSessionId(ID_A, { local: broken, session: broken })).not.toThrow();
    expect(readSessionId({ local: broken, session: broken })).toBeNull();
  });

  it("goes when the connection changes: a new pairing, a new Mac, or a disconnect means a new wallet", () => {
    const first = fakeStores({ [WALLET_KEY]: ID_A }, { [WALLET_KEY]: ID_B });
    saveConnection({ server: "http://192.168.0.6:8787", token: TOKEN }, first.stores);
    expect(readSessionId(first.stores)).toBeNull();
    expect(first.l.data.get(SERVER_KEY)).toBe("http://192.168.0.6:8787");
    const second = fakeStores({ [WALLET_KEY]: ID_A });
    clearConnection(second.stores);
    expect(readSessionId(second.stores)).toBeNull();
  });
});

describe("sessionAware", () => {
  it("passes a request through untouched while it holds no id", async () => {
    const seen: (RequestInit | undefined)[] = [];
    const inner = (async (_url: RequestInfo | URL, init?: RequestInit) => (seen.push(init), answer(null))) as typeof fetch;
    const init: RequestInit = { method: "GET", headers: { accept: "application/json" } };
    await sessionAware(inner, fakeStores().stores)("/api/info", init);
    expect(seen[0]).toBe(init);
  });

  it("keeps the id an answer carries and sends it on every later request, whatever the headers already there", async () => {
    const { stores } = fakeStores({ [TOKEN_KEY]: TOKEN });
    const sent: (string | null)[] = [];
    const replies = [answer(ID_A), answer(null), answer(null)];
    const inner = (async (_url: RequestInfo | URL, init?: RequestInit) => (sent.push(new Headers(init?.headers).get(SESSION_HEADER)), replies.shift() ?? answer(null))) as typeof fetch;
    const wrapped = sessionAware(inner, stores);
    await wrapped("/api/info");
    await wrapped("/api/snapshot", { headers: { accept: "application/json", "x-wally-token": TOKEN } });
    await wrapped("/api/events", { headers: new Headers({ accept: "text/event-stream" }) });
    expect(sent).toEqual([null, ID_A, ID_A]);
    expect(readSessionId(stores)).toBe(ID_A);
  });

  it("follows a new id (the old wallet was dropped) and ignores one that is not an id", async () => {
    const { stores } = fakeStores({ [TOKEN_KEY]: TOKEN });
    const replies = [answer(ID_A), answer(ID_B), answer("nonsense"), answer(null)];
    const sent: (string | null)[] = [];
    const inner = (async (_url: RequestInfo | URL, init?: RequestInit) => (sent.push(new Headers(init?.headers).get(SESSION_HEADER)), replies.shift() ?? answer(null))) as typeof fetch;
    const wrapped = sessionAware(inner, stores);
    for (let i = 0; i < 4; i += 1) await wrapped("/api/info");
    expect(sent).toEqual([null, ID_A, ID_B, ID_B]);
    expect(readSessionId(stores)).toBe(ID_B);
  });

  it("starts from the id the start-up probe left in storage", async () => {
    const { stores } = fakeStores({ [TOKEN_KEY]: TOKEN, [WALLET_KEY]: ID_A });
    const sent: (string | null)[] = [];
    const inner = (async (_url: RequestInfo | URL, init?: RequestInit) => (sent.push(new Headers(init?.headers).get(SESSION_HEADER)), answer(null))) as typeof fetch;
    await sessionAware(inner, stores)("/api/info");
    expect(sent).toEqual([ID_A]);
  });
});

describe("HttpApiClient", () => {
  it("learns the wallet from the first answer and sends it on reads, writes and the event stream", async () => {
    window.sessionStorage.setItem(TOKEN_KEY, TOKEN);
    const calls: { url: string; id: string | null }[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, id: new Headers(init?.headers).get(SESSION_HEADER) });
      return url.endsWith("/api/events") ? new Response(null, { status: 401 }) : answer(ID_A);
    }) as unknown as typeof fetch;
    const client = new HttpApiClient({ baseUrl: "http://192.168.0.6:8787", token: TOKEN, fetch: fetcher, eventWaitMs: 5, requestTimeoutMs: 1_000 });
    await client.info();
    await client.verify();
    client.subscribe(() => undefined);
    await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/events"))).toBe(true));
    client.dispose();
    expect(calls.find((c) => c.url.endsWith("/api/info"))?.id).toBeNull();
    expect(calls.filter((c) => !c.url.endsWith("/api/info")).map((c) => c.id)).toEqual(expect.arrayContaining([ID_A]));
    for (const c of calls.slice(1)) expect(c.id, c.url).toBe(ID_A);
  });

  it("sends no wallet header on a page that has none, so a plain browser and the old servers see nothing new", async () => {
    const seen: Headers[] = [];
    const fetcher = (async (_url: RequestInfo | URL, init?: RequestInit) => (seen.push(new Headers(init?.headers)), answer(null))) as typeof fetch;
    const client = new HttpApiClient({ fetch: fetcher });
    await client.info();
    await client.snapshot();
    client.dispose();
    for (const h of seen) expect(h.has(SESSION_HEADER)).toBe(false);
  });
});

describe("probeInfo", () => {
  it("sends the stored wallet id and keeps the one the answer carries, for the client that follows", async () => {
    window.sessionStorage.setItem(TOKEN_KEY, TOKEN);
    const sent: (string | null)[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => (sent.push(new Headers(init.headers).get(SESSION_HEADER)), answer(ID_A, { kind: "http" }))));
    expect(await probeInfo("http://192.168.0.6:8787", TOKEN)).toEqual({ kind: "http" });
    expect(sent).toEqual([null]);
    expect(window.sessionStorage.getItem(WALLET_KEY)).toBe(ID_A);
    await probeInfo("http://192.168.0.6:8787", TOKEN);
    expect(sent).toEqual([null, ID_A]);
  });

  it("changes nothing for a server that does not answer with an id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer(null, { kind: "http" })));
    await probeInfo(null, null);
    expect(window.sessionStorage.getItem(WALLET_KEY)).toBeNull();
    expect(window.localStorage.getItem(WALLET_KEY)).toBeNull();
  });
});
