// @vitest-environment node
// HttpApiClient the way a native shell uses it (pairing token, cross-origin page, no cookie jar) against the composed booth
// with practice wallets on, over a real listener. The server sees the peer as a phone on the Wi-Fi (injected address). The
// whole client contract must pass on the wallet the client is given, and every call and the event stream must be that one
// wallet: a client that kept no id would get a new wallet per request and fail here.
import { afterEach, describe, expect, it } from "vitest";
import type { Booth } from "../../server/compose";
import { HttpApiClient } from "../../src/api/http/HttpApiClient";
import type { TraceEvent } from "../../src/api/types";
import { apiClientContract } from "../apiClientContract";
import { listen, type Listening } from "../server/support/listen";
import { bootLan, testLan, TOKEN } from "../server/support/phones";
import { orchestratorIsReal } from "../server/support/realStack";

const REAL = await orchestratorIsReal();
const open: { client: HttpApiClient; server: Listening; booth: Booth }[] = [];

afterEach(async () => {
  for (const { client, server, booth } of open.splice(0)) {
    client.dispose();
    await booth.close();
    await server.close();
  }
});

/** What a native WebView sends: the shell's own origin on every request. */
const fromShell: typeof fetch = (input, init) => fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), origin: "capacitor://localhost" } });

async function make(): Promise<{ client: HttpApiClient; booth: Booth }> {
  const booth = await bootLan({ lan: testLan({ remoteAddress: () => "192.168.1.50" }) });
  const server = await listen(booth.app);
  const client = new HttpApiClient({ baseUrl: server.baseUrl, token: TOKEN, fetch: fromShell, requestTimeoutMs: 5_000, eventWaitMs: 1_000 });
  open.push({ client, server, booth });
  return { client, booth };
}

describe.skipIf(!REAL)("a native-style client with practice wallets on", () => {
  apiClientContract("HttpApiClient with the wallet header over a LAN-mode booth (real stack)", async () => {
    const { client } = await make();
    return { client, dispose: () => client.dispose() };
  });

  it("keeps one wallet for every call and for the event stream, and the Mac's wallet stays out of it", async () => {
    const { client, booth } = await make();
    // As the app does: the start-up probe (the first call) learns the wallet before anything else is sent.
    const info = await client.info();
    expect(info.sessions).toBe("private");
    const events: TraceEvent[] = [];
    client.subscribe((e) => events.push(e));
    const run = await client.runScenario("normal");
    expect(run.outcome).toBe("APPROVE");
    expect((await client.snapshot()).cards).toHaveLength(1);
    await client.verify();
    expect(booth.sessions?.size).toBe(1);
    expect(events.some((e) => e.type === "run.finished" && e.runId === run.runId)).toBe(true); // delivered by the wallet's own stream
    expect((await booth.backend.snapshot()).cards).toHaveLength(0);
  });

  it("a second client is a second wallet", async () => {
    const first = await make();
    const second = await make();
    await first.client.runScenario("normal");
    expect((await second.client.snapshot()).cards).toHaveLength(0);
    expect(first.booth.sessions?.size).toBe(1);
    expect(second.booth.sessions?.size).toBe(1);
  });

  it("answers with the old behaviour when the booth has practice wallets off: no id, one shared wallet", async () => {
    const booth = await bootLan({ env: { WALLY_SESSIONS: "off" }, lan: testLan({ remoteAddress: () => "192.168.1.50" }) });
    const server = await listen(booth.app);
    const client = new HttpApiClient({ baseUrl: server.baseUrl, token: TOKEN, fetch: fromShell, requestTimeoutMs: 5_000, eventWaitMs: 1_000 });
    open.push({ client, server, booth });
    expect((await client.info()).sessions).toBeUndefined();
    await client.runScenario("normal");
    expect((await booth.backend.snapshot()).cards).toHaveLength(1);
  });
});
