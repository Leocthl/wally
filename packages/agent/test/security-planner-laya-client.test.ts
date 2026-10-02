// Audit (lane s-audit), S-PLAN-1, fixed in lane m-qwen: the planner's Laya client used to follow HTTP redirects
// and read response bodies without a cap, unlike the judge's HTTP layer (judge/http.ts). A process squatting on
// the Laya port could bounce the shopper's request to a host the URL guard itself rejects. It now goes through
// planner/http.ts: redirect "error" and a 1 MiB streaming cap.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it, vi } from "vitest";
import { PlannerConfigError } from "../src/planner/config";
import { createLayaClient, type ChoiceSpec } from "../src/planner/laya-client";

const SPEC: ChoiceSpec = {
  id: "item_choice",
  instructions: "Which item is the shopper asking for?",
  criteria: { cotton_tee: "Cotton tee", ankle_socks: "Ankle socks" },
  state: { request: "SHOPPER-PRIVATE-REQUEST: 2 cotton tees" },
};

const listen = (server: Server) =>
  new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

const received: string[] = [];
const sink = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (b: Buffer) => chunks.push(b));
  req.on("end", () => {
    received.push(Buffer.concat(chunks).toString("utf8"));
    const answer = { probabilities: { cotton_tee: 0.05, ankle_socks: 0.95 } };
    res.end(JSON.stringify({ answers: { item_choice__r0: answer, item_choice__r1: answer }, usage: { truncated: false } }));
  });
});
const sinkPort = await listen(sink);
const redirector = createServer((_req, res) => {
  res.statusCode = 307;
  res.setHeader("location", `http://0.0.0.0:${sinkPort}/elsewhere`);
  res.end();
});
const redirectPort = await listen(redirector);
const REDIRECTED = await createLayaClient({ baseUrl: `http://127.0.0.1:${redirectPort}` }).choose(SPEC, 3_000);

const BODY_TOTAL = 8 << 20;
let bodySent = 0;
const block = new Uint8Array(1 << 20).fill(0x78);
vi.stubGlobal("fetch", async () =>
  new Response(
    new ReadableStream<Uint8Array>({
      pull(c) {
        if (bodySent >= BODY_TOTAL) return c.close();
        bodySent += block.length;
        c.enqueue(block);
      },
    }),
    { status: 200 },
  ),
);
await createLayaClient({ baseUrl: "http://127.0.0.1:8808" }).choose(SPEC, 30_000);
vi.unstubAllGlobals();

afterAll(async () => {
  await close(sink);
  await close(redirector);
});

describe("setup", () => {
  it("the URL guard rejects 0.0.0.0 when configured directly", () => {
    expect(() => createLayaClient({ baseUrl: `http://0.0.0.0:${sinkPort}` })).toThrow(PlannerConfigError);
  });
});

describe("S-PLAN-1 (fixed): planner Laya client refuses redirects and caps the body it reads", () => {
  it("a 307 from the Laya port is refused (the request never reaches another host)", () => {
    expect(received).toHaveLength(0);
    expect(REDIRECTED.ok).toBe(false);
  });

  it("the failure reason is a fixed phrase, not fetch's error message", () => {
    expect(REDIRECTED.ok ? "" : REDIRECTED.reason).toBe("Laya request failed (network error or redirect)");
  });

  it("a response body is read only up to a cap (judge/http.ts uses 1 MiB)", () => {
    expect(bodySent).toBeLessThan(BODY_TOTAL);
  });
});
