// @vitest-environment node
// A booth that restarts under an open page, over real loopback HTTP and SSE: the client tells the page when the stream comes back,
// and the page can then read the new booth (a new log, no budget) instead of the one it last heard. The booth restarts on the
// same port, as it does when the lead runs `pnpm demo` again.
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import type { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import type { Booth } from "../../server/compose";
import type { TraceEvent } from "../../src/api/types";
import { HttpApiClient } from "../../src/api/http/HttpApiClient";
import { m0SealRequest } from "../../src/api/mock/presets";
import { bootReal, orchestratorIsReal } from "../server/support/realStack";

const REAL = await orchestratorIsReal();

interface Running {
  readonly port: number;
  close(): Promise<void>;
}

/** Listens on 127.0.0.1; port 0 picks one, a number takes that one (the restart). */
function listenOn(app: Hono, port: number): Promise<Running> {
  return new Promise((resolve, reject) => {
    const server: ServerType = serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, (info: AddressInfo) => {
      resolve({
        port: info.port,
        close: () =>
          new Promise<void>((done) => {
            if ("closeAllConnections" in server && typeof server.closeAllConnections === "function") server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
    server.on("error", reject);
  });
}

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

const until = async (check: () => boolean, ms = 20_000): Promise<void> => {
  const stop = Date.now() + ms;
  while (!check()) {
    if (Date.now() > stop) throw new Error("timed out waiting for the reconnect");
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe.skipIf(!REAL)("a booth that restarts under an open page", () => {
  it("tells the client the stream is back, and the client reads a different booth", async () => {
    const first: Booth = await bootReal();
    const firstServer = await listenOn(first.app, 0);
    const client = new HttpApiClient({ baseUrl: `http://127.0.0.1:${firstServer.port}` });
    cleanup.push(() => client.dispose());
    let reconnects = 0;
    client.onReconnect(() => void (reconnects += 1));
    const heard: TraceEvent[] = [];
    client.subscribe((e) => void heard.push(e)); // the page's subscription: it starts the stream
    await client.seal(m0SealRequest(new Date())); // resolves once the stream has delivered the seal's events
    const before = await client.snapshot();
    expect(before.mandate).not.toBeNull();
    expect(reconnects).toBe(0); // the first connection is not a reconnect

    // The lead runs `pnpm demo` again: the old booth goes, a new one comes up on the same address.
    await firstServer.close();
    await first.close();
    const second: Booth = await bootReal();
    const secondServer = await listenOn(second.app, firstServer.port);
    cleanup.push(async () => {
      await secondServer.close();
      await second.close();
    });

    await until(() => reconnects === 1);
    // The new booth is another one: it sealed its own ready-made budget in a log of its own, which the page never heard of.
    const after = await client.snapshot();
    expect(after.packet?.log_id).toBeDefined();
    expect(after.packet?.log_id).not.toBe(before.packet?.log_id);
    // And the stream is live again: a seal on the new booth is heard.
    heard.length = 0;
    await client.seal(m0SealRequest(new Date()));
    await until(() => heard.some((e) => e.type === "mandate.sealed"));
    expect(reconnects).toBe(1);
  }, 40_000);
});
