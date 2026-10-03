// @vitest-environment node
// A booth with practice wallets that restarts under an open phone page, over real loopback HTTP and SSE: the phone's wallet is
// gone with the old process, the page reconnects with the id it holds, is given a new wallet (never an error), hears that the
// stream is back, reads the new wallet, and from then on every call and the stream are that one wallet.
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import type { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import type { Booth } from "../../server/compose";
import { HttpApiClient } from "../../src/api/http/HttpApiClient";
import type { TraceEvent } from "../../src/api/types";
import { bootLan, testLan, TOKEN } from "../server/support/phones";
import { orchestratorIsReal } from "../server/support/realStack";

const REAL = await orchestratorIsReal();

interface Running {
  readonly port: number;
  close(): Promise<void>;
}

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

/** What a native WebView sends: the shell's own origin on every request (so the booth tells the page its wallet id in a header). */
const fromShell: typeof fetch = (input, init) => fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), origin: "capacitor://localhost" } });

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

const phoneBooth = (): Promise<Booth> => bootLan({ lan: testLan({ remoteAddress: () => "192.168.1.50" }) });

describe.skipIf(!REAL)("a booth with practice wallets that restarts under an open phone page", () => {
  it("gives the page a new wallet, tells it the stream is back, and keeps every later call on that one wallet", async () => {
    const first = await phoneBooth();
    const firstServer = await listenOn(first.app, 0);
    const client = new HttpApiClient({ baseUrl: `http://127.0.0.1:${firstServer.port}`, token: TOKEN, fetch: fromShell, requestTimeoutMs: 5_000, eventWaitMs: 1_000 });
    cleanup.push(() => client.dispose());
    let reconnects = 0;
    client.onReconnect(() => void (reconnects += 1));
    const heard: TraceEvent[] = [];
    expect((await client.info()).sessions).toBe("private"); // the start-up probe: the page learns its wallet
    client.subscribe((e) => void heard.push(e));
    const bought = await client.runScenario("normal");
    expect(bought.outcome).toBe("APPROVE");
    const before = await client.snapshot();
    expect(before.cards).toHaveLength(1);
    expect(first.sessions?.size).toBe(1);

    // The lead runs `pnpm demo:lan` again: the old booth goes with every wallet in it, a new one comes up on the same address.
    await firstServer.close();
    await first.close();
    const second = await phoneBooth();
    const secondServer = await listenOn(second.app, firstServer.port);
    cleanup.push(async () => {
      await secondServer.close();
      await second.close();
    });

    await until(() => reconnects === 1);
    const after = await client.snapshot(); // read with the id the page still holds: a new wallet, not an error
    expect(after.packet?.log_id).toBeDefined();
    expect(after.packet?.log_id).not.toBe(before.packet?.log_id);
    expect(after.cards).toHaveLength(0);
    expect(after.packet?.remaining_minor).toBe(80_000);
    expect(second.sessions?.size).toBe(1); // the reconnect and the read were one wallet, not one each

    heard.length = 0;
    await client.runScenario("small");
    await until(() => heard.some((e) => e.type === "run.finished"));
    expect((await client.snapshot()).cards).toHaveLength(1);
    expect(second.sessions?.size).toBe(1);
    expect(reconnects).toBe(1);
  }, 40_000);
});
