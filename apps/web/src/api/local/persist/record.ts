// The stored session: one versioned JSON record under `wally:session:v1` in the page's localStorage. It holds exactly what
// on-device mode needs to carry on after a reload, because the orchestrator's state is derived from the log (the log is the
// only state) and the rail is rebuilt from the log (rail.ts):
//   v        1; any other number is another shape, refused (a later shape gets its own key and version)
//   savedAt  when it was written (ISO), for people reading storage; it decides nothing
//   keys     the two throwaway demo keys that signed the log (keys.ts), SIMULATED, already held by the page today
//   log      the log of the current budget as JSONL, one JCS line per entry (core toJsonl)
//   head     the checkpoint of the last entry; the restore checks the stored log still ends there (truncation)
// The reader is as strict as the writer is plain: exact field set, exact kinds, a size cap. Anything else is refused with a
// reason and the page starts fresh (plan.ts); a record is never half-read.
import { parseCheckpoint } from "@wally/core/log";
import type { Checkpoint } from "@wally/core/ports";
import type { KeyFileObject, KeyFiles } from "./keys";

export const SESSION_KEY = "wally:session:v1";
export const SESSION_VERSION = 1 as const;
/**
 * The most characters one record may have, written or read (localStorage counts UTF-16 units and keeps about 5 million per
 * site). A session this long was not made by a person at a phone; the page then keeps nothing rather than a stale copy.
 * UI only, ASSUMED: no register row.
 */
export const MAX_RECORD_CHARS = 1_500_000;

export interface SessionRecord {
  readonly v: typeof SESSION_VERSION;
  readonly savedAt: string;
  readonly keys: KeyFiles;
  readonly log: string;
  readonly head: Checkpoint;
}

export type RecordProblem = "TOO_LARGE" | "NOT_JSON" | "VERSION" | "SHAPE" | "NOT_KEPT";
export type Decoded = { readonly ok: true; readonly record: SessionRecord } | { readonly ok: false; readonly problem: RecordProblem };
export type Encoded = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly problem: "TOO_LARGE" };

const RECORD_FIELDS = ["head", "keys", "log", "savedAt", "v"];
const MARKER_FIELDS = ["kept", "v"];
const KEY_SLOTS = ["delegator", "engine"];
const KEY_FILE_FIELDS = ["did", "kind", "note", "role", "secret_key"];
const SHAPE = { ok: false, problem: "SHAPE" } as const;

type Obj = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Obj => value !== null && typeof value === "object" && !Array.isArray(value);
const sameFields = (value: Obj, fields: readonly string[]): boolean => Object.keys(value).sort().join() === fields.join();

function isKeyFile(value: unknown): value is KeyFileObject {
  return isObject(value) && sameFields(value, KEY_FILE_FIELDS) && Object.values(value).every((v) => typeof v === "string");
}

function keyFilesOf(value: unknown): KeyFiles | null {
  if (!isObject(value) || !sameFields(value, KEY_SLOTS)) return null;
  const { engine, delegator } = value;
  return isKeyFile(engine) && isKeyFile(delegator) ? { engine, delegator } : null;
}

/** An ISO time exactly as `Date.toISOString` spells it. */
const isIsoTime = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;

/**
 * Written in place of a session that cannot be kept (a family budget: Mum's key is never stored). It replaces the record of
 * the budget before it, so that record cannot come back and undo what happened since, and the next start reads it as "the
 * last session ended" (NOT_KEPT) instead of starting fresh in silence.
 */
export const NOT_KEPT_MARKER = JSON.stringify({ v: SESSION_VERSION, kept: false });

/** The record as text, or TOO_LARGE. The same input always gives the same text. */
export function encodeRecord(parts: { readonly savedAt: Date; readonly keys: KeyFiles; readonly log: string; readonly head: Checkpoint }): Encoded {
  const record: SessionRecord = { v: SESSION_VERSION, savedAt: parts.savedAt.toISOString(), keys: parts.keys, log: parts.log, head: parts.head };
  const text = JSON.stringify(record);
  return text.length > MAX_RECORD_CHARS ? { ok: false, problem: "TOO_LARGE" } : { ok: true, text };
}

/** Reads stored text. Never throws; a text that is too big is refused before it is parsed. */
export function decodeRecord(text: string): Decoded {
  if (text.length > MAX_RECORD_CHARS) return { ok: false, problem: "TOO_LARGE" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problem: "NOT_JSON" };
  }
  if (!isObject(raw)) return SHAPE;
  if (typeof raw["v"] === "number" && raw["v"] !== SESSION_VERSION) return { ok: false, problem: "VERSION" };
  if (raw["v"] === SESSION_VERSION && raw["kept"] === false && sameFields(raw, MARKER_FIELDS)) return { ok: false, problem: "NOT_KEPT" };
  if (raw["v"] !== SESSION_VERSION || !sameFields(raw, RECORD_FIELDS)) return SHAPE;
  const { savedAt, log } = raw;
  const keys = keyFilesOf(raw["keys"]);
  const head = parseCheckpoint(raw["head"]);
  if (!isIsoTime(savedAt) || typeof log !== "string" || !log.endsWith("\n") || keys === null || !head.ok) return SHAPE;
  return { ok: true, record: { v: SESSION_VERSION, savedAt, keys, log, head: head.value } };
}
