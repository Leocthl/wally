import type { LogEntry } from "../generated";
import type { Checkpoint, LogStore } from "../ports";
import { formatIssues, validateLogEntry } from "../schema";

export class LogAppendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogAppendError";
  }
}

export interface MemoryLogStoreOptions {
  /** Validate each entry against log-entry.schema.json before appending (default true). */
  readonly validate?: boolean;
}

/** In-memory append-only LogStore for tests. Rejects a wrong seq; stores frozen copies. */
export class MemoryLogStore implements LogStore {
  #logs: ReadonlyMap<string, readonly LogEntry[]> = new Map();
  readonly #validate: boolean;

  constructor(options: MemoryLogStoreOptions = {}) {
    this.#validate = options.validate ?? true;
  }

  async read(logId: string): Promise<readonly LogEntry[]> {
    return this.#logs.get(logId) ?? [];
  }

  async head(logId: string): Promise<Checkpoint | null> {
    const entries = this.#logs.get(logId) ?? [];
    const last = entries.at(-1);
    return last ? { log_id: last.log_id, seq: last.seq, entry_hash: last.entry_hash } : null;
  }

  async append(entry: LogEntry): Promise<void> {
    if (this.#validate) {
      const result = validateLogEntry(entry);
      if (!result.ok) throw new LogAppendError(`invalid log entry: ${formatIssues(result.errors)}`);
    }
    const entries = this.#logs.get(entry.log_id) ?? [];
    if (entry.seq !== entries.length) {
      throw new LogAppendError(`seq ${entry.seq} rejected for ${entry.log_id}: expected ${entries.length}`);
    }
    const stored = Object.freeze(structuredClone(entry));
    this.#logs = new Map([...this.#logs, [entry.log_id, Object.freeze([...entries, stored])]]);
  }
}
