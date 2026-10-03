// SessionLogStore: the page's in-memory LogStore (core's MemoryLogStore, which validates every entry and refuses a wrong
// seq) with three additions for keeping the session:
//  - a synchronous mirror of what was appended, because a page that is closing (pagehide) cannot wait for a promise;
//  - a hook, called after an entry is in, that says "the session changed" (the saver debounces it);
//  - a resume mode: the stored log is held back, so the orchestrator finds the log empty and seals it as new. The seal is
//    made with the stored credential at the stored time by the same engine key, so seq 0 comes out byte for byte as it is
//    stored (resume.ts). Only then is the rest of the stored log put behind it, in one step. Anything else fails closed.
import { jcs } from "@wally/core/crypto";
import type { LogEntry } from "@wally/core/generated";
import type { Checkpoint, LogStore } from "@wally/core/ports";
import { LogAppendError, MemoryLogStore } from "@wally/core/testing";

export interface SessionLogStoreOptions {
  /** A stored log (already verified) to hold back until its seq 0 is sealed again. Never empty. */
  readonly resume?: readonly LogEntry[];
  /** Called with the log id after each entry that is new (not for the stored entries put back). Never breaks an append. */
  readonly onAppend?: (logId: string) => void;
}

export class SessionLogStore implements LogStore {
  #inner: MemoryLogStore = new MemoryLogStore();
  readonly #onAppend: ((logId: string) => void) | undefined;
  #pending: readonly LogEntry[] | null;
  #mirror: ReadonlyMap<string, readonly LogEntry[]> = new Map();
  #last: string | null = null;

  constructor(options: SessionLogStoreOptions = {}) {
    if (options.resume?.length === 0) throw new LogAppendError("cannot resume from an empty log");
    this.#pending = options.resume ?? null;
    this.#onAppend = options.onAppend;
  }

  /** The log that was appended to last: the budget the page is on now. null before the first entry. */
  get lastLogId(): string | null {
    return this.#last;
  }

  /** The entries of one log as of now, without waiting. */
  entriesOf(logId: string): readonly LogEntry[] {
    return this.#mirror.get(logId) ?? [];
  }

  read(logId: string): Promise<readonly LogEntry[]> {
    return this.#inner.read(logId);
  }

  head(logId: string): Promise<Checkpoint | null> {
    return this.#inner.head(logId);
  }

  async append(entry: LogEntry): Promise<void> {
    if (this.#pending !== null) return this.#putBack(entry);
    await this.#inner.append(entry);
    await this.#remember(entry.log_id);
    try {
      this.#onAppend?.(entry.log_id);
    } catch {
      // A broken saver must never undo an append: the log is the record, saving is a convenience.
    }
  }

  async #remember(logId: string): Promise<void> {
    this.#mirror = new Map([...this.#mirror, [logId, await this.#inner.read(logId)]]);
    this.#last = logId;
  }

  /** The seal again: the entry has to be the stored seq 0 exactly; then the whole stored log goes in, or nothing does. */
  async #putBack(entry: LogEntry): Promise<void> {
    const stored = this.#pending ?? [];
    const first = stored[0];
    if (first === undefined || entry.seq !== 0 || entry.log_id !== first.log_id || jcs(entry) !== jcs(first)) {
      throw new LogAppendError("resume: the seal is not the stored seal (seq 0 differs), so the stored log is not used");
    }
    const scratch = new MemoryLogStore();
    for (const kept of stored) await scratch.append(kept); // every entry is validated again; a bad one leaves this store empty
    this.#inner = scratch;
    this.#pending = null;
    await this.#remember(first.log_id);
  }
}
