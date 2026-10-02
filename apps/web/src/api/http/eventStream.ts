// EventSource-style reader for GET /api/events over fetch streaming: parses `id:`, `data:` and comment lines,
// reconnects with capped exponential backoff, and delivers TraceEvents to listeners in arrival order. Buffers are
// bounded: a line longer than MAX_LINE_CHARS drops the connection (and reconnects) instead of growing memory.
// The server sends `: ready <seq>` on connect; waitFor(seq) lets a caller wait until it has seen the events a
// request caused, so a resolved API call means its trace events were already delivered.
import type { TraceEvent, TraceListener, Unsubscribe } from "../types";

export interface EventStreamOptions {
  readonly url: string;
  readonly fetch: typeof fetch;
  /** First reconnect delay; doubles up to maxBackoffMs. */
  readonly initialBackoffMs?: number;
  readonly maxBackoffMs?: number;
}

/** Longest SSE line we accept. A trace event with a full cart and decision is a few kilobytes. */
export const MAX_LINE_CHARS = 1_000_000;
const DEFAULT_INITIAL_BACKOFF_MS = 250;
const DEFAULT_MAX_BACKOFF_MS = 5_000;

type Waiter = { readonly seq: number; readonly resolve: () => void };

function isTraceEvent(value: unknown): value is TraceEvent {
  return value !== null && typeof value === "object" && typeof (value as { type?: unknown }).type === "string";
}

export class EventStream {
  readonly #opts: EventStreamOptions;
  #listeners: ReadonlySet<TraceListener> = new Set();
  #abort: AbortController | null = null;
  #running = false;
  #connected = false;
  #delivered = 0;
  #readyWaiters: readonly (() => void)[] = [];
  #seqWaiters: readonly Waiter[] = [];
  #pendingId: number | null = null;
  #pendingData: readonly string[] = [];

  constructor(opts: EventStreamOptions) {
    this.#opts = opts;
  }

  get connected(): boolean {
    return this.#connected;
  }

  subscribe(listener: TraceListener): Unsubscribe {
    this.#listeners = new Set([...this.#listeners, listener]);
    this.start();
    return () => {
      this.#listeners = new Set([...this.#listeners].filter((l) => l !== listener));
    };
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#abort = new AbortController();
    void this.#loop(this.#abort.signal);
  }

  close(): void {
    this.#running = false;
    this.#abort?.abort();
    this.#abort = null;
    this.#setConnected(false);
  }

  /** Resolves once connected, or after timeoutMs (never rejects: the caller goes on without live events). */
  ready(timeoutMs: number): Promise<void> {
    this.start();
    if (this.#connected) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      this.#readyWaiters = [...this.#readyWaiters, () => (clearTimeout(timer), resolve())];
    });
  }

  /** Resolves once the event with this id was delivered, after timeoutMs, or at once when not connected. */
  waitFor(seq: number, timeoutMs: number): Promise<void> {
    if (!this.#connected || this.#delivered >= seq) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      this.#seqWaiters = [...this.#seqWaiters, { seq, resolve: () => (clearTimeout(timer), resolve()) }];
    });
  }

  async #loop(signal: AbortSignal): Promise<void> {
    let backoff = this.#opts.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
    while (this.#running && !signal.aborted) {
      const gotData = await this.#connectOnce(signal);
      this.#setConnected(false);
      if (!this.#running || signal.aborted) break;
      backoff = gotData ? (this.#opts.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS) : backoff;
      await sleep(backoff, signal);
      backoff = Math.min(backoff * 2, this.#opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS);
    }
  }

  /** One connection; true when it delivered anything (resets the backoff). Never throws. */
  async #connectOnce(signal: AbortSignal): Promise<boolean> {
    let got = false;
    try {
      const res = await this.#opts.fetch(this.#opts.url, { headers: { accept: "text/event-stream" }, signal, cache: "no-store" });
      if (!res.ok || res.body === null) return false;
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let carry = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got = true;
        const lines = (carry + value).split(/\r\n|\r|\n/);
        carry = lines.pop() ?? "";
        if (carry.length > MAX_LINE_CHARS) break;
        for (const line of lines) this.#line(line);
      }
      await reader.cancel().catch(() => undefined);
    } catch {
      // network error or abort: the loop reconnects unless closed
    }
    return got;
  }

  #line(line: string): void {
    if (line === "") return this.#dispatch();
    if (line.startsWith(":")) {
      const ready = /^: ?ready (\d+)$/.exec(line);
      if (ready) this.#onReady(Number(ready[1]));
      return;
    }
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "data") this.#pendingData = [...this.#pendingData, value];
    else if (field === "id" && /^\d+$/.test(value)) this.#pendingId = Number(value);
  }

  #dispatch(): void {
    const data = this.#pendingData.join("\n");
    const id = this.#pendingId;
    this.#pendingData = [];
    this.#pendingId = null;
    if (data === "") return;
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      return; // a malformed message is skipped, never fatal
    }
    if (isTraceEvent(event)) this.#deliver(event);
    if (id !== null) this.#markDelivered(id);
  }

  #deliver(event: TraceEvent): void {
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch {
        // a failing listener must not stop the others or the stream
      }
    }
  }

  #onReady(serverSeq: number): void {
    // Events before this connection are not replayed (clients read /api/snapshot), so count them as seen.
    this.#delivered = Math.max(this.#delivered, serverSeq);
    this.#setConnected(true);
    this.#markDelivered(serverSeq);
  }

  #markDelivered(seq: number): void {
    this.#delivered = Math.max(this.#delivered, seq);
    const due = this.#seqWaiters.filter((w) => w.seq <= this.#delivered);
    this.#seqWaiters = this.#seqWaiters.filter((w) => w.seq > this.#delivered);
    for (const w of due) w.resolve();
  }

  #setConnected(on: boolean): void {
    this.#connected = on;
    if (on) {
      const waiters = this.#readyWaiters;
      this.#readyWaiters = [];
      for (const w of waiters) w();
      return;
    }
    // Nobody will deliver these now: release the waiters instead of holding the caller.
    const waiting = this.#seqWaiters;
    this.#seqWaiters = [];
    for (const w of waiting) w.resolve();
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });
}
