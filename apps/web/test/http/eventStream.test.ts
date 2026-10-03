// The event stream reader tells the page when the connection came BACK (not on the first connect), so the page can read the booth
// again: events from the gap are not replayed, and a booth that restarted has a log of its own. It also counts delivered events
// from the server's own number after a reconnect, so a restarted booth (numbers start again) does not look as if it had delivered
// events it never sent.
import { afterEach, describe, expect, it } from "vitest";
import { EventStream } from "../../src/api/http/eventStream";

const encoder = new TextEncoder();

/** One connection the test controls: lines go in, closing it is the connection dropping. */
class Connection {
  #controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  readonly body = new ReadableStream<Uint8Array>({ start: (c) => void (this.#controller = c) });
  send(text: string): void {
    this.#controller?.enqueue(encoder.encode(text));
  }
  drop(): void {
    this.#controller?.close();
  }
}

/** A fetch that hands out the next prepared connection each time the stream (re)connects. */
function server(connections: readonly Connection[]): { readonly fetch: typeof fetch; readonly opened: () => number } {
  let n = 0;
  const fetchFn = (async () => {
    const conn = connections[n++];
    if (conn === undefined) throw new Error("no more connections");
    return new Response(conn.body, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
  return { fetch: fetchFn, opened: () => n };
}

const until = async (check: () => boolean, ms = 2000): Promise<void> => {
  const stop = Date.now() + ms;
  while (!check()) {
    if (Date.now() > stop) throw new Error("timed out waiting for the stream");
    await new Promise((r) => setTimeout(r, 5));
  }
};

let stream: EventStream | null = null;
afterEach(() => {
  stream?.close();
  stream = null;
});

describe("EventStream reconnects", () => {
  it("says nothing on the first connect, and once when the connection comes back", async () => {
    const [first, second] = [new Connection(), new Connection()];
    const s = server([first, second]);
    stream = new EventStream({ url: "/api/events", fetch: s.fetch, initialBackoffMs: 1, maxBackoffMs: 2 });
    let back = 0;
    stream.onReconnect(() => void (back += 1));
    stream.start();
    first.send(": ready 3\n\n");
    await until(() => stream?.connected === true);
    expect(back).toBe(0);
    first.drop();
    await until(() => s.opened() === 2);
    second.send(": ready 5\n\n");
    await until(() => back === 1);
    expect(stream.connected).toBe(true);
  });

  it("does not call a listener that was removed", async () => {
    const [first, second] = [new Connection(), new Connection()];
    const s = server([first, second]);
    stream = new EventStream({ url: "/api/events", fetch: s.fetch, initialBackoffMs: 1, maxBackoffMs: 2 });
    let back = 0;
    const off = stream.onReconnect(() => void (back += 1));
    stream.start();
    first.send(": ready 1\n\n");
    await until(() => stream?.connected === true);
    off();
    first.drop();
    await until(() => s.opened() === 2);
    second.send(": ready 2\n\n");
    await until(() => stream?.connected === true);
    expect(back).toBe(0);
  });

  it("counts from the server's number again when the booth restarted (its numbers start over)", async () => {
    const [first, second] = [new Connection(), new Connection()];
    const s = server([first, second]);
    stream = new EventStream({ url: "/api/events", fetch: s.fetch, initialBackoffMs: 1, maxBackoffMs: 2 });
    stream.start();
    first.send(": ready 40\n\n");
    await until(() => stream?.connected === true);
    first.drop();
    await until(() => stream?.connected === false);
    await until(() => s.opened() === 2);
    second.send(": ready 0\n\n");
    await until(() => stream?.connected === true);
    // Event 1 of the new booth has not arrived: waiting for it must wait, not return as if event 40 had covered it.
    let released = false;
    void stream.waitFor(1, 1000).then(() => void (released = true));
    await new Promise((r) => setTimeout(r, 30));
    expect(released).toBe(false);
    second.send("id: 1\ndata: {\"type\":\"reset\",\"at\":\"2026-10-03T00:00:00Z\"}\n\n");
    await until(() => released);
  });
});
