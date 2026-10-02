// @vitest-environment node
// LAN mode of the booth server (opt-in): off by default and unchanged; on, every /api call but /api/health needs the
// pairing token (header or cookie) unless it comes from a page on the Mac itself; Host and Origin rules widen to the
// Mac's own addresses and the native shells; /api/lan answers only to the Mac. Hono app.request with a fake network
// and a fake socket address: no real interface is read and no port is opened.
import type { NetworkInterfaceInfo } from "node:os";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpApp } from "../../server/app";
import type { BoothBackend } from "../../server/backend";
import { constantTimeEqual, isLoopbackAddress, lanPostOrigin, newPairingToken, TOKEN_COOKIE } from "../../server/http/lan";
import { SseHub } from "../../server/http/sse";
import { createLanOptions, type NetworkInfo } from "../../server/lanMode";
import { m0SealRequest } from "../../src/api/mock/presets";
import { mockBackend } from "./support/mockBackend";

const TOKEN = "0123456789abcdef0123456789abcdef";
const PHONE_URL = "http://192.168.1.23:8787";
const MAC_URL = "http://127.0.0.1:8787";

const iface = (address: string, family: "IPv4" | "IPv6", internal = false): NetworkInterfaceInfo =>
  ({ address, netmask: "255.255.255.0", family, mac: "00:00:00:00:00:00", internal, cidr: `${address}/24` }) as NetworkInterfaceInfo;

const NETWORK: NetworkInfo = {
  interfaces: () => ({
    lo0: [iface("127.0.0.1", "IPv4", true)],
    en0: [iface("192.168.1.23", "IPv4"), iface("fe80::1", "IPv6")],
    bridge100: [iface("172.20.10.1", "IPv4")],
    en5: [iface("169.254.7.7", "IPv4")],
  }),
  hostname: () => "Leos-Mac.local",
};

/** The peer address Node would report on the socket (read by the real getConnInfo). */
const peer = (remoteAddress: string) => ({ incoming: { socket: { remoteAddress } } });
const FROM_MAC = peer("127.0.0.1");
const FROM_PHONE = peer("192.168.1.50");

let hub: SseHub;
let backend: BoothBackend;

function build(lanOn: boolean, over: { readonly remoteAddress?: () => string | undefined } = {}): Hono {
  const lan = lanOn ? { ...createLanOptions({ port: 8787, network: NETWORK, token: TOKEN }), ...over } : undefined;
  return createHttpApp({
    backend: () => backend,
    hub,
    ...(lan === undefined ? {} : { lan }),
    extraRoutes: (app) => app.get("*", (c) => c.html("<!doctype html><title>shell</title>")),
  });
}

const call = (app: Hono, url: string, init: RequestInit = {}, env: object = FROM_PHONE): Promise<Response> => app.request(url, init, env);
const json = (headers: Record<string, string> = {}): RequestInit => ({ method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" });
const errorCode = async (res: Response): Promise<string> => ((await res.json()) as { error: { code: string } }).error.code;

beforeEach(async () => {
  hub = new SseHub({ keepAliveMs: 60_000, maxQueuedChunks: 64 });
  const made = mockBackend();
  backend = made.backend;
  made.mock.subscribe((e) => hub.publish(e));
  await backend.seal(m0SealRequest(new Date()));
});

afterEach(() => hub.close());

describe("LAN mode off (the default)", () => {
  it("keeps the loopback-only rules: a LAN Host, a native Origin and /api/lan are all refused", async () => {
    const app = build(false);
    const lanHost = await call(app, `${PHONE_URL}/api/info`);
    expect(lanHost.status).toBe(403);
    expect(await errorCode(lanHost)).toBe("FORBIDDEN_HOST");
    const native = await call(app, `${MAC_URL}/api/verify`, json({ origin: "capacitor://localhost" }), FROM_MAC);
    expect(native.status).toBe(403);
    expect(await errorCode(native)).toBe("FORBIDDEN_ORIGIN");
    expect((await call(app, `${MAC_URL}/api/lan`, {}, FROM_MAC)).status).toBe(404);
  });

  it("needs no token on loopback and does not turn /?t= into a pairing redirect", async () => {
    const app = build(false);
    expect((await call(app, `${MAC_URL}/api/info`, {}, FROM_MAC)).status).toBe(200);
    const page = await call(app, `${MAC_URL}/?t=${TOKEN}`, {}, FROM_MAC);
    expect(page.status).toBe(200);
    expect(page.headers.get("set-cookie")).toBeNull();
  });
});

describe("LAN mode on: the pairing token", () => {
  it("asks for it on every /api call but /api/health, with a JSON 401", async () => {
    const app = build(true);
    for (const path of ["/api/info", "/api/snapshot", "/api/log", "/api/export", "/api/events", "/api/nope"]) {
      const res = await call(app, `${PHONE_URL}${path}`);
      expect(res.status, path).toBe(401);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(await errorCode(res)).toBe("UNAUTHORIZED");
    }
    expect((await call(app, `${PHONE_URL}/api/verify`, json())).status).toBe(401);
    expect((await call(app, `${PHONE_URL}/api/health`)).status).toBe(200);
  });

  it("accepts the token as a header or as the cookie, and refuses a wrong or empty one", async () => {
    const app = build(true);
    expect((await call(app, `${PHONE_URL}/api/info`, { headers: { "x-wally-token": TOKEN } })).status).toBe(200);
    expect((await call(app, `${PHONE_URL}/api/info`, { headers: { cookie: `other=1; ${TOKEN_COOKIE}=${TOKEN}` } })).status).toBe(200);
    for (const bad of [TOKEN.replace("0", "1"), TOKEN.slice(1), `${TOKEN}0`, ""]) {
      expect((await call(app, `${PHONE_URL}/api/info`, { headers: { "x-wally-token": bad } })).status, bad).toBe(401);
      expect((await call(app, `${PHONE_URL}/api/info`, { headers: { cookie: `${TOKEN_COOKIE}=${bad}` } })).status, bad).toBe(401);
    }
  });

  it("lets a stale header through when the cookie is right (a page that was paired again)", async () => {
    const res = await call(build(true), `${PHONE_URL}/api/info`, { headers: { "x-wally-token": "stale", cookie: `${TOKEN_COOKIE}=${TOKEN}` } });
    expect(res.status).toBe(200);
  });

  it("serves the app shell without the token", async () => {
    const res = await call(build(true), `${PHONE_URL}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>shell</title>");
  });

  it("asks for no token from a page on the Mac itself, but not from a phone that only claims a loopback Host", async () => {
    const app = build(true);
    expect((await call(app, `${MAC_URL}/api/info`, {}, FROM_MAC)).status).toBe(200);
    expect((await call(app, `${MAC_URL}/api/verify`, json(), FROM_MAC)).status).toBe(200);
    expect((await call(app, `${MAC_URL}/api/info`, {}, FROM_PHONE)).status).toBe(401);
    expect((await call(app, `${MAC_URL}/api/info`, {}, {})).status).toBe(401); // no socket information: fail closed
    expect((await call(app, `${PHONE_URL}/api/info`, {}, FROM_MAC)).status).toBe(401); // the Mac's own LAN address is not loopback
  });
});

describe("LAN mode on: /?t=<token>", () => {
  it("sets the cookie once, redirects to / without the token, and the cookie then opens the API", async () => {
    const app = build(true);
    const res = await call(app, `${PHONE_URL}/?t=${TOKEN}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${TOKEN_COOKIE}=${TOKEN}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
    const paired = await call(app, `${PHONE_URL}/api/info`, { headers: { cookie: cookie.split(";")[0] ?? "" } });
    expect(paired.status).toBe(200);
  });

  it("keeps other query parameters and the path, and drops only the token", async () => {
    const res = await call(build(true), `${PHONE_URL}/verifier/?a=1&t=${TOKEN}&b=2`);
    expect(res.headers.get("location")).toBe("/verifier/?a=1&b=2");
  });

  it("sets no cookie for a wrong token (it still redirects, so the bad token leaves the address bar)", async () => {
    const app = build(true);
    const res = await call(app, `${PHONE_URL}/?t=nope`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("never redirects to another host, even for a path that starts with slashes", async () => {
    const res = await call(build(true), `${PHONE_URL}//evil.example/x?t=${TOKEN}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/evil.example/x");
  });

  it("ignores the parameter on a Host the Mac does not own", async () => {
    const res = await call(build(true), "http://evil.example:8787/?t=" + TOKEN, { headers: { host: "evil.example:8787" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("LAN mode on: Host", () => {
  it.each([
    ["127.0.0.1:8787", 200],
    ["localhost:8787", 200],
    ["192.168.1.23:8787", 200],
    ["192.168.1.23:9999", 200],
    ["172.20.10.1:8787", 200],
    ["169.254.7.7:8787", 200],
    ["leos-mac.local:8787", 200],
    ["Leos-Mac.local:8787", 200],
    ["leos-mac:8787", 200],
    ["192.168.1.24:8787", 403],
    ["10.0.0.5:8787", 403],
    ["evil.example:8787", 403],
    ["leos-mac.local.evil.example:8787", 403],
    ["192.168.1.23@evil.example:8787", 403],
  ])("Host %s -> %i", async (host, status) => {
    const res = await call(build(true), `http://${host.split("@").pop() ?? host}/api/info`, { headers: { host, "x-wally-token": TOKEN } });
    expect(res.status).toBe(status);
    if (status === 403) expect(await errorCode(res)).toBe("FORBIDDEN_HOST");
  });
});

describe("LAN mode on: POST Origin", () => {
  const post = (origin: string | null, extra: Record<string, string> = {}) =>
    call(build(true), `${PHONE_URL}/api/verify`, json({ "x-wally-token": TOKEN, ...(origin === null ? {} : { origin }), ...extra }));

  it.each([
    [null, {}, 200],
    [PHONE_URL, { "sec-fetch-site": "same-origin" }, 200],
    ["http://192.168.1.23:8787", {}, 200],
    ["http://leos-mac.local:8787", { host: "leos-mac.local:8787" }, 200],
    ["http://127.0.0.1:5173", {}, 200],
    ["capacitor://localhost", { "sec-fetch-site": "cross-site" }, 200],
    ["http://localhost", {}, 200],
    ["https://localhost", {}, 200],
    ["http://evil.example", {}, 403],
    ["http://192.168.1.99:8787", {}, 403],
    ["capacitor://localhost:8787", {}, 403],
    ["capacitor://evil", {}, 403],
    ["null", {}, 403],
    [PHONE_URL, { "sec-fetch-site": "cross-site" }, 403],
  ] as const)("Origin %s %j -> %i", async (origin, extra, status) => {
    const res = await post(origin, extra);
    expect(res.status).toBe(status);
    if (status === 403) expect(await errorCode(res)).toBe("FORBIDDEN_ORIGIN");
  });

  it("still needs application/json", async () => {
    const res = await call(build(true), `${PHONE_URL}/api/verify`, { method: "POST", headers: { "x-wally-token": TOKEN, "content-type": "text/plain" }, body: "{}" });
    expect(res.status).toBe(415);
  });

  it("exposes the verdict as a pure function over the request", () => {
    const lan = createLanOptions({ port: 8787, network: NETWORK, token: TOKEN });
    const ctx = (headers: Record<string, string>) => ({ req: { header: (name: string) => headers[name.toLowerCase()], url: `${PHONE_URL}/api/verify` } }) as never;
    expect(lanPostOrigin(ctx({ origin: "capacitor://localhost", "sec-fetch-site": "cross-site", host: "192.168.1.23:8787" }), lan)).toBe("ok");
    expect(lanPostOrigin(ctx({ origin: "http://evil.example", host: "192.168.1.23:8787" }), lan)).toBe("foreign_origin");
    expect(lanPostOrigin(ctx({ "sec-fetch-site": "cross-site", host: "192.168.1.23:8787" }), lan)).toBe("cross_site");
  });
});

describe("LAN mode on: CORS for the native shells", () => {
  const preflight = (origin: string, headers = "content-type, x-wally-token") =>
    call(build(true), `${PHONE_URL}/api/seal`, { method: "OPTIONS", headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": headers } });

  it.each(["capacitor://localhost", "http://localhost", "https://localhost"])("answers the preflight of %s without a token, echoing the origin", async (origin) => {
    const res = await preflight(origin);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    expect(res.headers.get("access-control-allow-headers")).toBe("content-type, x-wally-token");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("vary")).toContain("Origin");
  });

  it("refuses the preflight of any other origin and never sends a wildcard", async () => {
    for (const origin of ["http://evil.example", "http://192.168.1.99:8787", "null"]) {
      const res = await preflight(origin);
      expect(res.status, origin).toBe(403);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
  });

  it("refuses the preflight on a Host the Mac does not own", async () => {
    const res = await call(build(true), "http://evil.example:8787/api/seal", { method: "OPTIONS", headers: { host: "evil.example:8787", origin: "capacitor://localhost" } });
    expect(res.status).toBe(403);
  });

  it("marks real answers for a native origin, errors included, and exposes X-Event-Seq", async () => {
    const app = build(true);
    const ok = await call(app, `${PHONE_URL}/api/info`, { headers: { origin: "capacitor://localhost", "x-wally-token": TOKEN } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect(ok.headers.get("access-control-expose-headers")).toBe("x-event-seq");
    const denied = await call(app, `${PHONE_URL}/api/info`, { headers: { origin: "capacitor://localhost" } });
    expect(denied.status).toBe(401);
    expect(denied.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    const missing = await call(app, `${PHONE_URL}/api/nope`, { headers: { origin: "https://localhost", "x-wally-token": TOKEN } });
    expect(missing.status).toBe(404);
    expect(missing.headers.get("access-control-allow-origin")).toBe("https://localhost");
  });

  it("marks the event stream too, so a native shell can read it", async () => {
    const res = await call(build(true), `${PHONE_URL}/api/events`, { headers: { origin: "capacitor://localhost", "x-wally-token": TOKEN } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    await res.body?.cancel();
  });

  it("sends no CORS header to a foreign origin or to a request without one", async () => {
    const app = build(true);
    const foreign = await call(app, `${PHONE_URL}/api/info`, { headers: { origin: "http://evil.example", "x-wally-token": TOKEN } });
    expect(foreign.headers.get("access-control-allow-origin")).toBeNull();
    const plain = await call(app, `${PHONE_URL}/api/info`, { headers: { "x-wally-token": TOKEN } });
    expect(plain.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("runs a native POST end to end: preflight, then the call with the token header", async () => {
    const app = build(true);
    expect((await preflight("capacitor://localhost")).status).toBe(204);
    const res = await call(app, `${PHONE_URL}/api/scenario/normal`, json({ origin: "capacitor://localhost", "x-wally-token": TOKEN, "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(200);
    expect(Number(res.headers.get("x-event-seq"))).toBeGreaterThan(0);
    expect(res.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
  });
});

describe("GET /api/lan", () => {
  it("answers a page on the Mac with the token, the pairing links and an inline SVG QR code for each", async () => {
    const res = await call(build(true), `${MAC_URL}/api/lan`, {}, FROM_MAC);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { lan: boolean; token: string; urls: string[]; qrSvg: string[] };
    expect(body.lan).toBe(true);
    expect(body.token).toBe(TOKEN);
    expect(body.urls).toEqual([`http://192.168.1.23:8787/?t=${TOKEN}`, `http://172.20.10.1:8787/?t=${TOKEN}`, `http://leos-mac.local:8787/?t=${TOKEN}`]);
    expect(body.qrSvg).toHaveLength(body.urls.length);
    for (const svg of body.qrSvg) {
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("</svg>");
    }
    expect(new Set(body.qrSvg).size).toBe(body.qrSvg.length); // each link has its own code
  });

  it("is a 404 for everyone else: another Host, another peer, no socket information, LAN mode off", async () => {
    const app = build(true);
    expect((await call(app, `${PHONE_URL}/api/lan`, { headers: { "x-wally-token": TOKEN } }, FROM_MAC)).status).toBe(404); // Host is not loopback
    expect((await call(app, `${MAC_URL}/api/lan`, { headers: { "x-wally-token": TOKEN } }, FROM_PHONE)).status).toBe(404); // peer is not loopback
    expect((await call(app, `${MAC_URL}/api/lan`, {}, {})).status).toBe(404); // unknown peer
    expect((await call(app, `${PHONE_URL}/api/lan`)).status).toBe(404); // not even a 401 for a stranger
    expect((await call(build(false), `${MAC_URL}/api/lan`, {}, FROM_MAC)).status).toBe(404);
  });

  it("takes the peer from an injected reader as well", async () => {
    const app = build(true, { remoteAddress: () => "::ffff:127.0.0.1" });
    expect((await call(app, `${MAC_URL}/api/lan`, {}, {})).status).toBe(200);
  });

  it("follows a change of address without a restart", async () => {
    let address = "192.168.1.23";
    const net: NetworkInfo = { hostname: () => "mac", interfaces: () => ({ en0: [iface(address, "IPv4")] }) };
    const lan = createLanOptions({ port: 8787, network: net, token: TOKEN });
    const app = createHttpApp({ backend: () => backend, hub, lan });
    const first = (await (await call(app, `${MAC_URL}/api/lan`, {}, FROM_MAC)).json()) as { urls: string[] };
    address = "10.1.2.3";
    const second = (await (await call(app, `${MAC_URL}/api/lan`, {}, FROM_MAC)).json()) as { urls: string[] };
    expect(first.urls[0]).toContain("192.168.1.23");
    expect(second.urls[0]).toContain("10.1.2.3");
    expect((await call(app, "http://10.1.2.3:8787/api/health")).status).toBe(200);
    expect((await call(app, "http://192.168.1.23:8787/api/health")).status).toBe(403);
  });
});

describe("helpers", () => {
  it("newPairingToken is 128 random bits as 32 lower-case hex characters, new each time", () => {
    const a = newPairingToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newPairingToken()).not.toBe(a);
    expect(newPairingToken((bytes) => bytes.fill(255))).toBe("ff".repeat(16));
  });

  it("constantTimeEqual compares whole strings of any length", () => {
    expect(constantTimeEqual(TOKEN, TOKEN)).toBe(true);
    expect(constantTimeEqual(TOKEN, TOKEN.slice(0, -1))).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("", "a")).toBe(false);
    expect(constantTimeEqual("a", "b")).toBe(false);
  });

  it.each([
    ["127.0.0.1", true],
    ["127.9.9.9", true],
    ["::1", true],
    ["::ffff:127.0.0.1", true],
    ["192.168.1.50", false],
    ["::ffff:192.168.1.50", false],
    ["128.0.0.1", false],
    [undefined, false],
  ])("isLoopbackAddress(%s) is %s", (address, expected) => {
    expect(isLoopbackAddress(address)).toBe(expected);
  });
});
