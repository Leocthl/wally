// Reads an SSE response body in tests: collects `id`/`data` messages and comments until a predicate holds.
import type { TraceEvent } from "../../../src/api/types";

export interface SseMessage {
  readonly id: number | null;
  readonly event: TraceEvent;
}

export interface SseReader {
  readonly messages: SseMessage[];
  readonly comments: string[];
  /** Raw text received so far (for scanning). */
  raw(): string;
  until(done: (m: readonly SseMessage[]) => boolean, timeoutMs?: number): Promise<void>;
  close(): Promise<void>;
}

export function readSse(body: ReadableStream<Uint8Array>): SseReader {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const messages: SseMessage[] = [];
  const comments: string[] = [];
  let text = "";
  let carry = "";
  let closed = false;

  function parseBlock(block: string): void {
    let id: number | null = null;
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) comments.push(line.slice(1).trim());
      else if (line.startsWith("id: ")) id = Number(line.slice(4));
      else if (line.startsWith("data: ")) data.push(line.slice(6));
    }
    if (data.length > 0) messages.push({ id, event: JSON.parse(data.join("\n")) as TraceEvent });
  }

  async function pump(): Promise<boolean> {
    const { done, value: bytes } = await reader.read();
    if (done) return false;
    const value = decoder.decode(bytes, { stream: true });
    text += value;
    const blocks = (carry + value).split("\n\n");
    carry = blocks.pop() ?? "";
    for (const block of blocks) parseBlock(block);
    return true;
  }

  return {
    messages,
    comments,
    raw: () => text,
    async until(done, timeoutMs = 5_000) {
      const deadline = Date.now() + timeoutMs;
      while (!done(messages)) {
        if (closed || Date.now() > deadline) throw new Error(`SSE condition not met; got ${messages.map((m) => m.event.type).join(",")}`);
        const more = await Promise.race([pump(), new Promise<boolean>((r) => setTimeout(() => r(true), Math.max(1, deadline - Date.now())))]);
        if (!more) closed = true;
      }
    },
    async close() {
      closed = true;
      await reader.cancel().catch(() => undefined);
    },
  };
}
