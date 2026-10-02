// @vitest-environment node
// HttpApiClient against the real routes and SSE on a loopback listener, backed by the offline mock: proves the
// HTTP + SSE + client layers pass the same contract as MockApiClient. The orchestrator-backed run is separate.
import { afterEach } from "vitest";
import { createHttpApp } from "../../server/app";
import { SseHub } from "../../server/http/sse";
import { HttpApiClient } from "../../src/api/http/HttpApiClient";
import { apiClientContract } from "../apiClientContract";
import { mockBackend } from "../server/support/mockBackend";
import { listen, type Listening } from "../server/support/listen";

const open: { client: HttpApiClient; server: Listening; hub: SseHub }[] = [];

afterEach(async () => {
  for (const { client, server, hub } of open.splice(0)) {
    client.dispose();
    hub.close();
    await server.close();
  }
});

apiClientContract("HttpApiClient over loopback (mock backend)", async () => {
  const hub = new SseHub({ keepAliveMs: 15_000, maxQueuedChunks: 1024 });
  const { backend, mock } = mockBackend();
  mock.subscribe((e) => hub.publish(e));
  const server = await listen(createHttpApp({ backend: () => backend, hub }));
  const client = new HttpApiClient({ baseUrl: server.baseUrl });
  open.push({ client, server, hub });
  return { client, dispose: () => client.dispose() };
});
