// @vitest-environment node
// POST /api/see in LAN mode, the way a phone on the booth Wi-Fi reaches it: the pairing token is needed (header or cookie),
// the phone page's own origin may post, a foreign origin may not, and the larger picture cap applies behind the same guards.
import type { NetworkInterfaceInfo } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpApp, NOT_COMPOSED_BACKEND } from "../../server/app";
import type { BoothBackend } from "../../server/backend";
import { SseHub } from "../../server/http/sse";
import { createLanOptions, type NetworkInfo } from "../../server/lanMode";
import type { SeeResult } from "../../src/api/types";
import { jpegBytes, toBase64 } from "../helpers/pictures";

const TOKEN = "0123456789abcdef0123456789abcdef";
const PHONE_URL = "http://192.168.1.23:8787";
const iface = (address: string, family: "IPv4" | "IPv6", internal = false): NetworkInterfaceInfo =>
  ({ address, netmask: "255.255.255.0", family, mac: "00:00:00:00:00:00", internal, cidr: `${address}/24` }) as NetworkInterfaceInfo;
const NETWORK: NetworkInfo = { interfaces: () => ({ lo0: [iface("127.0.0.1", "IPv4", true)], en0: [iface("192.168.1.23", "IPv4")] }), hostname: () => "Leos-Mac.local" };
const FROM_PHONE = { incoming: { socket: { remoteAddress: "192.168.1.50" } } };
const RESULT: SeeResult = { source: "chips", attributes: { kind: "tee", colors: [], pattern: null, fit: null, style: [] }, palette: [], matches: [] };

let hub: SseHub;
beforeEach(() => {
  hub = new SseHub({ keepAliveMs: 60_000, maxQueuedChunks: 64 });
});
afterEach(() => hub.close());

function phonePost(body: unknown, headers: Record<string, string>): Promise<Response> {
  const backend: BoothBackend = { ...NOT_COMPOSED_BACKEND, see: async () => RESULT };
  const app = createHttpApp({ backend: () => backend, hub, lan: createLanOptions({ port: 8787, network: NETWORK, token: TOKEN }) });
  return Promise.resolve(app.request(`${PHONE_URL}/api/see`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }, FROM_PHONE));
}

describe("POST /api/see from a phone", () => {
  it("is refused without the pairing token", async () => {
    const res = await phonePost({ attributes: { kind: "tee" } }, { origin: PHONE_URL });
    expect(res.status).toBe(401);
  });

  it("answers a phone that has the token and posts from the page it was given", async () => {
    const res = await phonePost({ attributes: { kind: "tee" } }, { "x-wally-token": TOKEN, origin: PHONE_URL });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESULT);
  });

  it("takes a page-prepared picture of a few hundred kilobytes", async () => {
    const body = new Uint8Array(400_000);
    body.set(jpegBytes());
    const res = await phonePost({ image: { mime: "image/jpeg", data: toBase64(body) } }, { "x-wally-token": TOKEN, origin: PHONE_URL });
    expect(res.status).toBe(200);
  });

  it("refuses a foreign origin even with the token", async () => {
    const res = await phonePost({ attributes: { kind: "tee" } }, { "x-wally-token": TOKEN, origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });
});
