// FileLogStore (Node only, @wally/core/log/file): append-only JSONL at <dir>/<log_id>.jsonl, one JCS line
// per entry, fsync after every append. The directory is created 0700 and each log file 0600 (they hold the
// packet's whole history). Appends to one file are serialised across every FileLogStore in this process,
// keyed by absolute path; a wrong seq or prev_hash, an invalid entry, card data (I8), oversized rule inputs or
// an over-long line is refused. A corrupt file fails closed on read and append.
import { chmod, mkdir, open, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { errorMessage } from "../crypto/errors";
import { formatIssues, validateLogEntry } from "../schema";
import type { LogEntry } from "../generated";
import type { Checkpoint, LogStore } from "../ports";
import { checkpointOf } from "./checkpoint";
import { LogError } from "./errors";
import { GENESIS_PREV_HASH } from "./hashing";
import { findCardData } from "./i8";
import { assertLogId } from "./ids";
import { toJsonlLine } from "./jsonl";
import { decisionInputsProblem, lineProblem } from "./limits";

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const PERMISSION_BITS = 0o777;
/** Schema issues kept in an error message. */
const MAX_ISSUES = 3;

/**
 * Write queue per absolute log path, shared by every FileLogStore in this process, so two stores opened on the
 * same directory cannot interleave a read-check-append. Another process is not covered: one API server owns
 * LOG_DIR (stated limit).
 */
let tails: ReadonlyMap<string, Promise<void>> = new Map();

function enqueue(path: string, write: () => Promise<void>): Promise<void> {
  const run = (tails.get(path) ?? Promise.resolve()).then(write);
  // The queue only orders writers; each caller still receives its own rejection through `run`.
  const settled = run.catch(() => undefined);
  tails = new Map(tails).set(path, settled);
  void settled.then(() => {
    if (tails.get(path) === settled) tails = new Map([...tails].filter(([key]) => key !== path));
  });
  return run;
}

function parseLine(line: string, index: number): LogEntry {
  const tooLong = lineProblem(line);
  if (tooLong !== null) throw new LogError("CORRUPT", `line ${index}: ${tooLong}`);
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    throw new LogError("CORRUPT", `line ${index} is not JSON`);
  }
  const check = validateLogEntry(raw);
  if (!check.ok) throw new LogError("CORRUPT", `line ${index}: ${formatIssues(check.errors.slice(0, MAX_ISSUES))}`);
  if (check.value.seq !== index) throw new LogError("CORRUPT", `line ${index} holds seq ${check.value.seq}`);
  return check.value;
}

function isMissing(err: unknown): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT";
}

/** The line to append, or a LogError for anything the log must refuse. */
function lineFor(entry: LogEntry): string {
  const check = validateLogEntry(entry);
  if (!check.ok) throw new LogError("SCHEMA", formatIssues(check.errors.slice(0, MAX_ISSUES)));
  const finding = findCardData(entry);
  if (finding !== null) throw new LogError("CARD_DATA", `refused (I8): ${finding}`);
  const oversized = entry.kind === "DECISION" ? decisionInputsProblem(entry.payload) : null;
  if (oversized !== null) throw new LogError("LIMIT", `refused: ${oversized}`);
  const line = toJsonlLine(entry);
  const tooLong = lineProblem(line);
  if (tooLong !== null) throw new LogError("LIMIT", `refused: ${tooLong}`);
  return line;
}

export class FileLogStore implements LogStore {
  readonly #dir: string;

  /** dir = LOG_DIR (default .data/logs, gitignored). Created 0700 on the first append. */
  constructor(dir: string) {
    this.#dir = resolve(dir);
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
    let path: string;
    try {
      path = this.pathFor(entry.log_id);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new LogError("LOG_ID", "log id is not valid"));
    }
    return enqueue(path, () => this.#appendNow(entry, path));
  }

  async #appendNow(entry: LogEntry, path: string): Promise<void> {
    const line = lineFor(entry);
    const head = await this.head(entry.log_id);
    const expected = head === null ? 0 : head.seq + 1;
    if (entry.seq !== expected) throw new LogError("SEQ", `seq ${entry.seq} rejected for ${entry.log_id}: expected ${expected}`);
    if (entry.prev_hash !== (head === null ? GENESIS_PREV_HASH : head.entry_hash)) {
      throw new LogError("PREV_HASH", `prev_hash does not match the head of ${entry.log_id}`);
    }
    await this.#privateDir();
    const file = await open(path, "a", FILE_MODE);
    try {
      if (((await file.stat()).mode & PERMISSION_BITS) !== FILE_MODE) await file.chmod(FILE_MODE);
      await file.write(`${line}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
  }

  /** LOG_DIR exists and is 0700. A wider directory is tightened; one we cannot tighten is refused (fail closed). */
  async #privateDir(): Promise<void> {
    await mkdir(this.#dir, { recursive: true, mode: DIR_MODE });
    if (((await stat(this.#dir)).mode & PERMISSION_BITS) === DIR_MODE) return;
    try {
      await chmod(this.#dir, DIR_MODE);
    } catch (err) {
      throw new LogError("PERMISSIONS", `LOG_DIR must be a private directory (0700) and could not be restricted: ${errorMessage(err)}`);
    }
  }
}
