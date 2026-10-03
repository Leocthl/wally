// The client side of LAN mode: reading a pasted pairing link (private hosts only), where the token and the booth Mac's
// address are kept, the token and base URL on every request, and the start-up choice of a native shell that saved a
// booth Mac. Fake stores and fake fetches only.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureTokenFromUrl,
  clearConnection,
  isPrivateHost,
  parseBoothLink,
  readServer,
  readToken,
  saveConnection,
  SERVER_KEY,
  TOKEN_KEY,
  type ConnectionStores,
} from "../src/api/http/connection";
import { HttpApiClient } from "../src/api/http/HttpApiClient";
import { parseLanInfo, svgDataUrl } from "../src/api/http/lanInfo";
import { localForced, pickClient, probeInfo, selectApi } from "../src/api/local/select";

const TOKEN = "0123456789abcdef0123456789abcdef";

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
  delete (window as { Capacitor?: unknown }).Capacitor;
  window.history.replaceState(null, "", "/");
});

describe("isPrivateHost", () => {
  it.each([
    ["192.168.0.6", true],
    ["10.14.0.2", true],
    ["172.16.0.1", true],
    ["172.31.255.254", true],
    ["172.20.10.1", true],
    ["169.254.1.1", true],
    ["127.0.0.1", true],
    ["localhost", true],
    ["booth-mac.local", true],
    ["BOOTH-MAC.LOCAL", true],
    ["[::1]", true],
    ["[fd12:3456::1]", true],
    ["[fe80::1]", true],
    ["8.8.8.8", false],
    ["172.15.0.1", false],
    ["172.32.0.1", false],
    ["100.64.0.1", false],
    ["192.169.0.1", false],
    ["300.1.1.1", false],
    ["example.com", false],
    ["local", false],
    ["booth-mac", false],
    ["192.168.0.6.evil.example", false],
    ["notlocal.example", false],
    ["[2001:db8::1]", false],
  ])("%s -> %s", (host, expected) => {
    expect(isPrivateHost(host)).toBe(expected);
  });
});

describe("parseBoothLink", () => {
  it("takes the origin and the token from the link the server shows", () => {
    expect(parseBoothLink(`http://192.168.0.6:8787/?t=${TOKEN}`)).toEqual({ ok: true, server: "http://192.168.0.6:8787", token: TOKEN });
    expect(parseBoothLink(`  http://booth-mac.local:8787/some/path?x=1&t=${TOKEN}#/booth \n`)).toEqual({ ok: true, server: "http://booth-mac.local:8787", token: TOKEN });
  });

  it("reads a bare address as http, with or without a token", () => {
    expect(parseBoothLink("192.168.0.6:8787")).toEqual({ ok: true, server: "http://192.168.0.6:8787", token: null });
    expect(parseBoothLink(`10.0.0.5/?t=${TOKEN}`)).toEqual({ ok: true, server: "http://10.0.0.5", token: TOKEN });
    expect(parseBoothLink("https://booth-mac.local:8443")).toEqual({ ok: true, server: "https://booth-mac.local:8443", token: null });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["http://", "not_url"],
    ["javascript:alert(1)", "not_url"],
    ["ftp://192.168.0.6/", "scheme"],
    ["file:///etc/passwd", "scheme"],
    ["capacitor://localhost", "scheme"],
    ["http://user:secret@192.168.0.6:8787/", "credentials"],
    ["http://example.com/?t=abcdefgh12345678", "host"],
    ["http://8.8.8.8:8787/", "host"],
    ["http://192.168.0.6.evil.example/", "host"],
    ["http://192.168.0.6:8787/?t=short", "token"],
    ["http://192.168.0.6:8787/?t=has space in it!", "token"],
  ])("refuses %j (%s)", (text, problem) => {
    expect(parseBoothLink(text)).toEqual({ ok: false, problem });
  });
});

describe("stored connection", () => {
  it("reads the session token first, then the saved one, and ignores a malformed value", () => {
    expect(readToken(fakeStores({ [TOKEN_KEY]: "aaaaaaaa" }, { [TOKEN_KEY]: "bbbbbbbb" }).stores)).toBe("bbbbbbbb");
    expect(readToken(fakeStores({ [TOKEN_KEY]: "aaaaaaaa" }).stores)).toBe("aaaaaaaa");
    expect(readToken(fakeStores({ [TOKEN_KEY]: "no good!" }).stores)).toBeNull();
    expect(readToken(fakeStores().stores)).toBeNull();
    expect(readToken({ local: null, session: null })).toBeNull();
  });

  it("checks the saved server again on every read", () => {
    expect(readServer(fakeStores({ [SERVER_KEY]: "http://192.168.0.6:8787" }).stores)).toBe("http://192.168.0.6:8787");
    expect(readServer(fakeStores({ [SERVER_KEY]: "http://evil.example" }).stores)).toBeNull();
    expect(readServer(fakeStores({ [SERVER_KEY]: "garbage" }).stores)).toBeNull();
    expect(readServer(fakeStores().stores)).toBeNull();
  });

  it("saves and clears server and token together, and survives storage that throws", () => {
    const { l, s, stores } = fakeStores({}, { [TOKEN_KEY]: "stale-token" });
    saveConnection({ server: "http://192.168.0.6:8787", token: TOKEN }, stores);
    expect(l.data.get(SERVER_KEY)).toBe("http://192.168.0.6:8787");
    expect(l.data.get(TOKEN_KEY)).toBe(TOKEN);
    expect(s.data.has(TOKEN_KEY)).toBe(false);
    clearConnection(stores);
    expect([...l.data.keys(), ...s.data.keys()]).toEqual([]);
    saveConnection({ server: "http://10.0.0.5:8787", token: null }, stores);
    expect(l.data.has(TOKEN_KEY)).toBe(false);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(() => saveConnection({ server: "http://10.0.0.5:8787", token: TOKEN }, { local: broken, session: broken })).not.toThrow();
    expect(readToken({ local: broken, session: broken })).toBeNull();
    expect(() => clearConnection({ local: broken, session: broken })).not.toThrow();
  });
});

describe("captureTokenFromUrl", () => {
  it("keeps the token for this tab and takes it out of the address, with the other parameters and the hash left alone", () => {
    const { s, stores } = fakeStores();
    const replaceState = vi.fn();
    expect(captureTokenFromUrl({ search: `?a=1&t=${TOKEN}&b=2`, pathname: "/app/", hash: "#/booth" }, { replaceState }, stores)).toBe(true);
    expect(s.data.get(TOKEN_KEY)).toBe(TOKEN);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/app/?a=1&b=2#/booth");
  });

  it("drops a malformed token from the address without keeping it, and does nothing without one", () => {
    const { s, stores } = fakeStores();
    const replaceState = vi.fn();
    expect(captureTokenFromUrl({ search: "?t=%3Cscript%3E", pathname: "/", hash: "" }, { replaceState }, stores)).toBe(true);
    expect(s.data.size).toBe(0);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/");
    replaceState.mockClear();
    expect(captureTokenFromUrl({ search: "?a=1", pathname: "/", hash: "" }, { replaceState }, stores)).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
  });
});

describe("HttpApiClient with a token and a base URL", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

  it("sends X-Wally-Token on reads, writes and the event stream, to the configured server", async () => {
    const calls: { url: string; headers: Headers; method: string }[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, headers: new Headers(init?.headers), method: init?.method ?? "GET" });
      return url.endsWith("/api/events") ? new Response(null, { status: 401 }) : ok({ ok: true });
    }) as unknown as typeof fetch;
    const client = new HttpApiClient({ baseUrl: "http://192.168.0.6:8787/", token: TOKEN, fetch: fetcher, eventWaitMs: 5, requestTimeoutMs: 1_000 });
    client.subscribe(() => undefined); // opens the stream
    await client.info();
    await client.verify();
    await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/events"))).toBe(true));
    client.dispose();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(expect.arrayContaining(["GET http://192.168.0.6:8787/api/info", "POST http://192.168.0.6:8787/api/verify", "GET http://192.168.0.6:8787/api/events"]));
    for (const call of calls) expect(call.headers.get("x-wally-token"), call.url).toBe(TOKEN);
    expect(calls.find((c) => c.method === "POST")?.headers.get("content-type")).toBe("application/json");
  });

  it("sends no token header when it has none (a page on the booth's own origin relies on the cookie)", async () => {
    const seen: Headers[] = [];
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers));
      return ok({ ok: true });
    }) as typeof fetch;
    const client = new HttpApiClient({ fetch: fetcher });
    await client.info();
    client.dispose();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.has("x-wally-token")).toBe(false);
  });
});

describe("start-up choice with a saved booth Mac", () => {
  const info = { kind: "http", replayed: false };

  it("tries the saved server even when the build says VITE_API=local, but never against ?api=local", async () => {
    const probe = vi.fn(async () => info);
    expect(await selectApi({ search: "", env: "local", server: "http://192.168.0.6:8787", probe })).toEqual({ kind: "http", reason: "server" });
    expect(probe).toHaveBeenCalledWith("http://192.168.0.6:8787");
    probe.mockClear();
    expect(await selectApi({ search: "?api=local", env: "local", server: "http://192.168.0.6:8787", probe })).toEqual({ kind: "local", reason: "forced" });
    expect(probe).not.toHaveBeenCalled();
    expect(localForced("", "local", true)).toBe(false);
    expect(localForced("", "local", false)).toBe(true);
  });

  it("falls back to on-device mode when the saved server does not answer", async () => {
    const down = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await selectApi({ search: "", env: "local", server: "http://192.168.0.6:8787", probe: down })).toEqual({ kind: "local", reason: "no-server" });
  });

  it("probeInfo asks the saved server for /api/info with the token", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(info), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await probeInfo("http://192.168.0.6:8787", TOKEN)).toEqual(info);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://192.168.0.6:8787/api/info");
    expect(new Headers(init.headers).get("x-wally-token")).toBe(TOKEN);
    fetcher.mockClear();
    await probeInfo(null, null);
    const [sameOrigin, plain] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(sameOrigin).toBe("/api/info");
    expect(new Headers(plain.headers).has("x-wally-token")).toBe(false);
  });

  it("pickClient in a native shell connects to the saved booth Mac with its token; in a browser it ignores the saved address", async () => {
    window.localStorage.setItem(SERVER_KEY, "http://192.168.0.6:8787");
    window.localStorage.setItem(TOKEN_KEY, TOKEN);
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string) => (urls.push(input), new Response(JSON.stringify(info), { status: 200 }))));
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    const native = await pickClient();
    expect(native.api.kind).toBe("http");
    expect(native.onDevice).toBe(false);
    expect(urls).toEqual(["http://192.168.0.6:8787/api/info"]);
    (native.api as HttpApiClient).dispose();

    delete (window as { Capacitor?: unknown }).Capacitor;
    urls.length = 0;
    const browser = await pickClient();
    expect(urls).toEqual(["/api/info"]);
    (browser.api as HttpApiClient).dispose();
  });

  it("pickClient runs on the device when the saved booth Mac refuses the token", async () => {
    window.localStorage.setItem(SERVER_KEY, "http://192.168.0.6:8787");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), { status: 401 })));
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    const picked = await pickClient();
    expect(picked.onDevice).toBe(true);
    expect(picked.api.kind).toBe("local");
  });
});

describe("LanInfo", () => {
  const good = { lan: true, token: TOKEN, urls: ["http://192.168.0.6:8787/?t=x"], qrSvg: ["<svg xmlns='http://www.w3.org/2000/svg'></svg>"] };

  it("accepts the server's answer and nothing else", () => {
    expect(parseLanInfo(good)).toEqual(good);
    for (const bad of [null, "<!doctype html>", {}, { ...good, lan: false }, { ...good, token: 5 }, { ...good, urls: [] }, { ...good, qrSvg: ["<script>"] }, { ...good, urls: [1], qrSvg: ["<svg/>"] }]) {
      expect(parseLanInfo(bad)).toBeNull();
    }
  });

  it("turns SVG into an image source (an <img> never runs script)", () => {
    expect(svgDataUrl("<svg/>")).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E");
  });
});
