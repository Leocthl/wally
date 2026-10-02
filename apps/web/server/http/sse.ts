// Server-Sent Events hub: every TraceEvent goes to every connected client as `id: <seq>` + `data: <json>`.
// No replay (clients call /api/snapshot first). On connect a client gets a `: ready <seq>` comment, then a
// keep-alive comment every keepAliveMs. Backpressure: each client has a bounded queue; a client that falls
// behind is dropped, so a slow browser can never block or slow the pipeline (publish is synchronous).
import type { TraceEvent } from "../../src/api/types";

export interface SseHubOptions {
  /** Keep-alive comment interval (the brief: every 15 s). */
  readonly keepAliveMs: number;
  /** Chunks a client may have queued before it is dropped. */
  readonly maxQueuedChunks: number;
}

interface Client {
  readonly id: number;
  readonly controller: ReadableStreamDefaultController<Uint8Array>;
}

const encoder = new TextEncoder();

export const SSE_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

export class SseHub {
  readonly #opts: SseHubOptions;
  #clients: ReadonlyMap<number, Client> = new Map();
  #seq = 0;
  #nextClientId = 1;
  #timer: ReturnType<typeof setInterval> | null = null;
  #closed = false;
  #dropped = 0;

  constructor(opts: SseHubOptions) {
    this.#opts = opts;
    this.#timer = setInterval(() => this.#broadcast(": keep-alive\n\n"), opts.keepAliveMs);
    this.#timer.unref?.();
  }

  /** Sequence number of the last published event (0 before the first). */
  get seq(): number {
    return this.#seq;
  }

  get clientCount(): number {
    return this.#clients.size;
  }

  /** Clients dropped for falling behind, since start. */
  get droppedCount(): number {
    return this.#dropped;
  }

  publish(event: TraceEvent): number {
    this.#seq += 1;
    this.#broadcast(`id: ${this.#seq}\ndata: ${JSON.stringify(event)}\n\n`);
    return this.#seq;
  }

  /** A streaming Response for one client. Closing the response (client gone) removes the client. */
  connect(): Response {
    if (this.#closed) return new Response(null, { status: 503 });
    const id = this.#nextClientId;
    this.#nextClientId += 1;
    const stream = new ReadableStream<Uint8Array>(
      {
        start: (controller) => {
          this.#clients = new Map([...this.#clients, [id, { id, controller }]]);
          controller.enqueue(encoder.encode(`: ready ${this.#seq}\n\n`));
        },
        cancel: () => this.#remove(id),
      },
      new CountQueuingStrategy({ highWaterMark: this.#opts.maxQueuedChunks }),
    );
    return new Response(stream, { status: 200, headers: SSE_HEADERS });
  }

  close(): void {
    this.#closed = true;
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
    for (const client of this.#clients.values()) this.#end(client);
    this.#clients = new Map();
  }

  #broadcast(chunk: string): void {
    const bytes = encoder.encode(chunk);
    for (const client of this.#clients.values()) this.#send(client, bytes);
  }

  #send(client: Client, bytes: Uint8Array): void {
    const room = client.controller.desiredSize;
    if (room === null || room <= 0) {
      this.#dropped += 1;
      this.#end(client);
      this.#remove(client.id);
      return;
    }
    try {
      client.controller.enqueue(bytes);
    } catch {
      this.#remove(client.id); // already closed by the other side
    }
  }

  #end(client: Client): void {
    try {
      client.controller.close();
    } catch {
      // already closed
    }
  }

  #remove(id: number): void {
    if (!this.#clients.has(id)) return;
    this.#clients = new Map([...this.#clients].filter(([key]) => key !== id));
  }
}
