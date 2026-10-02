// @vitest-environment node
// SSE: ready comment, ids in order, a run's events end with run.finished, keep-alive, and slow clients dropped.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpApp } from "../../server/app";
import { SseHub } from "../../server/http/sse";
import { m0SealRequest } from "../../src/api/mock/presets";
import type { TraceEvent } from "../../src/api/types";
import { mockBackend } from "./support/mockBackend";
import { readSse } from "./support/sse";

const BASE = "http://127.0.0.1:8787";
const hubs: SseHub[] = [];

function makeHub(opts: Partial<{ keepAliveMs: number; maxQueuedChunks: number }> = {}): SseHub {
  const hub = new SseHub({ keepAliveMs: opts.keepAliveMs ?? 60_000, maxQueuedChunks: opts.maxQueuedChunks ?? 64 });
  hubs.push(hub);
  return hub;
}

afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
  vi.useRealTimers();
});

describe("GET /api/events", () => {
  it("sends a ready comment, then every event of a run in order with rising ids", async () => {
    const hub = makeHub();
    const { backend, mock } = mockBackend();
    mock.subscribe((e) => hub.publish(e));
    await backend.seal(m0SealRequest(new Date()));
    const app = createHttpApp({ backend: () => backend, hub });
    const res = await app.request(`${BASE}/api/events`);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const sse = readSse(res.body as ReadableStream<Uint8Array>);
    await sse.until(() => sse.comments.some((c) => c.startsWith("ready")));
    expect(sse.comments[0]).toBe(`ready ${hub.seq}`);
    const run = await app.request(`${BASE}/api/scenario/normal`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(run.status).toBe(200);
    await sse.until((m) => m.some((x) => x.event.type === "run.finished"));
    const types = sse.messages.map((m) => m.event.type);
    expect(types[0]).toBe("run.started");
    expect(types.at(-1)).toBe("run.finished");
    expect(types.indexOf("decision")).toBeLessThan(types.indexOf("card.minted"));
    expect(types.indexOf("card.minted")).toBeLessThan(types.indexOf("card.event"));
    const ids = sse.messages.map((m) => m.id ?? 0);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.at(-1)).toBe(Number(run.headers.get("x-event-seq")));
    await sse.close();
  });

  it("sends a keep-alive comment on the interval", async () => {
    vi.useFakeTimers();
    const hub = makeHub({ keepAliveMs: 15_000 });
    const sse = readSse(hub.connect().body as ReadableStream<Uint8Array>);
    vi.advanceTimersByTime(15_000);
    vi.useRealTimers();
    await sse.until(() => sse.comments.includes("keep-alive"));
    await sse.close();
  });

  it("drops a client that stops reading instead of blocking the publisher", async () => {
    const hub = makeHub({ maxQueuedChunks: 4 });
    const res = hub.connect();
    expect(hub.clientCount).toBe(1);
    const event: TraceEvent = { type: "reset", at: "2026-10-03T02:00:00Z" };
    for (let i = 0; i < 10; i += 1) hub.publish(event);
    expect(hub.clientCount).toBe(0);
    expect(hub.droppedCount).toBe(1);
    expect(hub.seq).toBe(10);
    await res.body?.cancel();
  });

  it("forgets a client that disconnects", async () => {
    const hub = makeHub();
    const res = hub.connect();
    expect(hub.clientCount).toBe(1);
    await res.body?.cancel();
    expect(hub.clientCount).toBe(0);
  });
});
