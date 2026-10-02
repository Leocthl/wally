// @vitest-environment node
// HttpApiClient with the pairing token against the real routes in LAN mode on a loopback listener. The server sees the
// peer as a phone on the Wi-Fi (injected address), so the token is asked for even though the test talks over loopback:
// the whole client contract, the event stream included, must pass with the token and fail with a 401 without it.
import { afterEach, describe, expect, it } from "vitest";
import { createHttpApp } from "../../server/app";
import { SseHub } from "../../server/http/sse";
import { createLanOptions, type NetworkInfo } from "../../server/lanMode";
import { ApiRequestError } from "../../src/api/http/errors";
import { HttpApiClient } from "../../src/api/http/HttpApiClient";
import { apiClientContract } from "../apiClientContract";
import { listen, type Listening } from "../server/support/listen";
import { mockBackend } from "../server/support/mockBackend";

const TOKEN = "0123456789abcdef0123456789abcdef";
const NETWORK: NetworkInfo = { interfaces: () => ({}), hostname: () => "booth-mac" };
const open: { client: HttpApiClient; server: Listening; hub: SseHub }[] = [];

afterEach(async () => {
  for (const { client, server, hub } of open.splice(0)) {
    client.dispose();
    hub.close();
    await server.close();
  }
});

async function start(token: string | undefined): Promise<HttpApiClient> {
  const hub = new SseHub({ keepAliveMs: 15_000, maxQueuedChunks: 1024 });
  const { backend, mock } = mockBackend();
  mock.subscribe((e) => hub.publish(e));
  const lan = { ...createLanOptions({ port: 0, network: NETWORK, token: TOKEN }), remoteAddress: () => "192.168.1.50" };
  const server = await listen(createHttpApp({ backend: () => backend, hub, lan }));
  const client = new HttpApiClient({ baseUrl: server.baseUrl, ...(token === undefined ? {} : { token }), requestTimeoutMs: 5_000, eventWaitMs: 1_000 });
  open.push({ client, server, hub });
  return client;
}

apiClientContract("HttpApiClient with the pairing token over a LAN-mode server (mock backend)", async () => {
  const client = await start(TOKEN);
  return { client, dispose: () => client.dispose() };
});

describe("HttpApiClient without or with a wrong pairing token", () => {
  it.each([
    ["no token", undefined],
    ["a wrong token", "ffffffffffffffffffffffffffffffff"],
  ])("gets a 401 UNAUTHORIZED on a read and on a write with %s", async (_name, token) => {
    const client = await start(token);
    await expect(client.info()).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    const write = await client.verify().catch((err: unknown) => err);
    expect(write).toBeInstanceOf(ApiRequestError);
    expect((write as ApiRequestError).status).toBe(401);
  });
});
