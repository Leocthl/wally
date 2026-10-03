// @vitest-environment node
// WALLY_PUBLIC_URL: the practice copy that works anywhere, shown on the booth Mac beside the pairing links. Read once from
// the environment, checked, and offered by GET /api/lan (a page on the Mac only). Unset or odd: not shown, nothing else changes.
import { describe, expect, it } from "vitest";
import { createHttpApp } from "../../server/app";
import { SseHub } from "../../server/http/sse";
import { createLanOptions, publicUrlFromEnv } from "../../server/lanMode";
import { parseLanInfo } from "../../src/api/http/lanInfo";
import { NETWORK, TOKEN, MAC_LOOPBACK_HOST, testLan } from "./support/phones";
import { mockBackend } from "./support/mockBackend";

describe("publicUrlFromEnv", () => {
  it.each([
    [{}, undefined],
    [{ WALLY_PUBLIC_URL: "" }, undefined],
    [{ WALLY_PUBLIC_URL: "   " }, undefined],
    [{ WALLY_PUBLIC_URL: "https://wally-dev.vercel.app" }, "https://wally-dev.vercel.app"],
    [{ WALLY_PUBLIC_URL: " https://wally-dev.vercel.app/ " }, "https://wally-dev.vercel.app"],
    [{ WALLY_PUBLIC_URL: "https://owner.github.io/wally/" }, "https://owner.github.io/wally/"],
    [{ WALLY_PUBLIC_URL: "http://example.org/try?lang=en" }, "http://example.org/try?lang=en"],
  ] as const)("%j gives %j with nothing to say", (env, url) => {
    expect(publicUrlFromEnv(env)).toEqual({ url, note: null });
  });

  it.each([
    "javascript:alert(1)",
    "ftp://example.org/",
    "file:///etc/passwd",
    "wally-dev.vercel.app",
    "https://",
    "https://user:secret@example.org/",
    "https://example.org/a b",
    `https://example.org/${"x".repeat(300)}`,
  ])("%s is not shown, and the operator is told", (value) => {
    const found = publicUrlFromEnv({ WALLY_PUBLIC_URL: value });
    expect(found.url).toBeUndefined();
    expect(found.note).toContain("WALLY_PUBLIC_URL");
    expect(found.note?.includes("secret")).toBe(false); // a password in a link is never echoed
  });
});

describe("GET /api/lan with a practice copy", () => {
  const ask = async (publicUrl: string | undefined): Promise<Response> => {
    const lan = { ...createLanOptions({ port: 8817, network: NETWORK, token: TOKEN, ...(publicUrl === undefined ? {} : { publicUrl }) }), remoteAddress: () => "127.0.0.1" };
    const hub = new SseHub({ keepAliveMs: 60_000, maxQueuedChunks: 4 });
    const app = createHttpApp({ backend: () => mockBackend().backend, hub, lan });
    const res = await app.request(`http://${MAC_LOOPBACK_HOST}/api/lan`);
    hub.close();
    return res;
  };

  it("adds the link and its own QR code to the Mac's answer", async () => {
    const res = await ask("https://wally-dev.vercel.app");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["publicUrl"]).toBe("https://wally-dev.vercel.app");
    expect(String(body["publicQrSvg"]).startsWith("<svg")).toBe(true);
    expect(body["qrSvg"]).not.toContain(body["publicQrSvg"]); // its own code, not one of the pairing codes
    expect(parseLanInfo(body)?.publicUrl).toBe("https://wally-dev.vercel.app");
  });

  it("adds nothing without one", async () => {
    const body = (await (await ask(undefined)).json()) as Record<string, unknown>;
    expect("publicUrl" in body).toBe(false);
    expect("publicQrSvg" in body).toBe(false);
    expect(parseLanInfo(body)?.publicUrl).toBeUndefined();
  });

  it("is still a 404 for everyone but the Mac, practice copy or not (the link is not for phones to read from the API)", async () => {
    const lan = { ...testLan({ publicUrl: "https://wally-dev.vercel.app" }), remoteAddress: () => "192.168.0.50" };
    const hub = new SseHub({ keepAliveMs: 60_000, maxQueuedChunks: 4 });
    const app = createHttpApp({ backend: () => mockBackend().backend, hub, lan });
    const res = await app.request("http://192.168.0.6:8817/api/lan", { headers: { "x-wally-token": TOKEN } });
    hub.close();
    expect(res.status).toBe(404);
  });
});
