// Head checkpoint {log_id, seq, entry_hash}, published outside the log after each append (presenter bar,
// delegator's phone). The verifier gets it separately and detects truncation or rewrite before it.
import type { LogEntry } from "../generated";
import type { Checkpoint, LogStore } from "../ports";
import type { ValidationResult } from "../schema";
import { LogError } from "./errors";
import { LOG_ID_RE } from "./ids";

const HASH_RE = /^[0-9a-f]{64}$/;
const FIELDS = ["entry_hash", "log_id", "seq"];

export function checkpointOf(entry: Pick<LogEntry, "log_id" | "seq" | "entry_hash">): Checkpoint {
  return Object.freeze({ log_id: entry.log_id, seq: entry.seq, entry_hash: entry.entry_hash });
}

const invalid = (message: string): ValidationResult<Checkpoint> => ({
  ok: false,
  errors: [{ path: "/", keyword: "checkpoint", message }],
});

/** Strict parse of an external checkpoint (file, QR, phone). No schema file exists for it yet. */
export function parseCheckpoint(value: unknown): ValidationResult<Checkpoint> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid("checkpoint must be an object");
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).sort().join() !== FIELDS.join()) return invalid("checkpoint fields are log_id, seq, entry_hash");
  const { log_id: logId, seq, entry_hash: hash } = raw;
  if (typeof logId !== "string" || !LOG_ID_RE.test(logId)) return invalid("log_id must match log_[A-Za-z0-9]{6,40}");
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0) return invalid("seq must be a non-negative integer");
  if (typeof hash !== "string" || !HASH_RE.test(hash)) return invalid("entry_hash must be 64 lowercase hex characters");
  return { ok: true, value: checkpointOf({ log_id: logId, seq, entry_hash: hash }) };
}

/** The store's head as a validated checkpoint, or null for an empty log. Fails closed on a bad head. */
export async function headCheckpoint(store: LogStore, logId: string): Promise<Checkpoint | null> {
  const head = await store.head(logId);
  if (head === null) return null;
  const parsed = parseCheckpoint({ log_id: head.log_id, seq: head.seq, entry_hash: head.entry_hash });
  if (!parsed.ok || parsed.value.log_id !== logId) throw new LogError("HEAD", `store returned an invalid head for ${logId}`);
  return parsed.value;
}
