// FileLogStore (Node only, @laisee/core/log/file): append-only JSONL at <dir>/<log_id>.jsonl, one JCS line
// per entry, fsync after every append. Appends to one log are serialised in-process; a wrong seq or
// prev_hash, an invalid entry or card data is refused. A corrupt file fails closed on read and append.
import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LogEntry } from "../generated";
import type { Checkpoint, LogStore } from "../ports";
import { formatIssues, validateLogEntry } from "../schema";
import { checkpointOf } from "./checkpoint";
import { LogError } from "./errors";
import { GENESIS_PREV_HASH } from "./hashing";
import { findCardData } from "./i8";
import { assertLogId } from "./ids";
import { toJsonlLine } from "./jsonl";

function parseLine(line: string, index: number): LogEntry {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    throw new LogError("CORRUPT", `line ${index} is not JSON`);
  }
  const check = validateLogEntry(raw);
  if (!check.ok) throw new LogError("CORRUPT", `line ${index}: ${formatIssues(check.errors)}`);
  if (check.value.seq !== index) throw new LogError("CORRUPT", `line ${index} holds seq ${check.value.seq}`);
  return check.value;
}

function isMissing(err: unknown): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT";
}

export class FileLogStore implements LogStore {
  readonly #dir: string;
  #tails: ReadonlyMap<string, Promise<void>> = new Map();

  /** dir = LOG_DIR (default .data/logs, gitignored). Created on the first append. */
  constructor(dir: string) {
    this.#dir = dir;
  }

  pathFor(logId: string): string {
    assertLogId(logId);
    return join(this.#dir, `${logId}.jsonl`);
  }

  async #lines(logId: string): Promise<string[]> {
    let text: string;
    try {
      text = await readFile(this.pathFor(logId), "utf8");
    } catch (err) {
      if (isMissing(err)) return [];
      throw err;
    }
    if (text === "") return [];
    if (!text.endsWith("\n")) throw new LogError("CORRUPT", `${logId}: last line has no newline (partial write)`);
    return text.slice(0, -1).split("\n");
  }

  async read(logId: string): Promise<readonly LogEntry[]> {
    const lines = await this.#lines(logId);
    return lines.map(parseLine);
  }

  async head(logId: string): Promise<Checkpoint | null> {
    const lines = await this.#lines(logId);
    const last = lines.at(-1);
    return last === undefined ? null : checkpointOf(parseLine(last, lines.length - 1));
  }

  /** Append-only; rejects seq !== head.seq + 1 and prev_hash !== head.entry_hash. */
  append(entry: LogEntry): Promise<void> {
    const logId = entry.log_id;
    const run = (this.#tails.get(logId) ?? Promise.resolve()).then(() => this.#appendNow(entry));
    // The queue only orders writers; each caller still receives its own rejection through `run`.
    this.#tails = new Map(this.#tails).set(logId, run.catch(() => undefined));
    return run;
  }

  async #appendNow(entry: LogEntry): Promise<void> {
    const check = validateLogEntry(entry);
    if (!check.ok) throw new LogError("SCHEMA", formatIssues(check.errors));
    const finding = findCardData(entry);
    if (finding !== null) throw new LogError("CARD_DATA", `refused (I8): ${finding}`);
    const path = this.pathFor(entry.log_id);
    const head = await this.head(entry.log_id);
    const expected = head === null ? 0 : head.seq + 1;
    if (entry.seq !== expected) throw new LogError("SEQ", `seq ${entry.seq} rejected for ${entry.log_id}: expected ${expected}`);
    if (entry.prev_hash !== (head === null ? GENESIS_PREV_HASH : head.entry_hash)) {
      throw new LogError("PREV_HASH", `prev_hash does not match the head of ${entry.log_id}`);
    }
    await mkdir(this.#dir, { recursive: true });
    const file = await open(path, "a");
    try {
      await file.write(`${toJsonlLine(entry)}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
  }
}
