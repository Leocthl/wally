// Hash-chained log for the offline mock: real SHA-256 over canonical JSON (docs/02 section 11 rules 1-5), placeholder
// signatures. The mock can therefore detect a flipped byte, but it cannot check signatures and says so (VerifyOutcome.skipped).
import { validateLogEntry } from "@laisee/core/schema";
import { PLACEHOLDER_ENGINE_DID, PLACEHOLDER_SIGNATURE } from "@laisee/core/testing";
import type { LogEntry, LogEntryKind, LogPayloadByKind } from "@laisee/core/generated";
import type { Checkpoint, VerifyFailure, VerifyResult } from "@laisee/core/ports";
import { canonicalize, sha256Hex } from "./hash";

const ZERO_HASH = "0".repeat(64);

export const CHECKED: readonly VerifyFailure[] = ["SCHEMA", "SEQ", "PREV_HASH", "PAYLOAD_HASH", "ENTRY_HASH", "TRUNCATED"];
/** The mock signs with placeholders, so these two checks cannot run (docs/02 section 11 steps 6 and 7). */
export const SKIPPED: readonly VerifyFailure[] = ["SIGNATURE", "PAYLOAD_SIGNATURE"];

function entryHash(h: Omit<LogEntry, "kind" | "payload" | "entry_hash" | "signature"> & { kind: LogEntryKind }): string {
  const { v, log_id, seq, kind, ts, prev_hash, payload_hash, signer } = h;
  return sha256Hex(canonicalize({ v, log_id, seq, kind, ts, prev_hash, payload_hash, signer }));
}

/** Returns a new array with one more entry; the input is never mutated. */
export function appendEntry<K extends LogEntryKind>(
  entries: readonly LogEntry[],
  logId: string,
  kind: K,
  payload: LogPayloadByKind[K],
  now: Date,
): readonly LogEntry[] {
  const prev = entries.at(-1);
  const header = {
    v: 1 as const,
    log_id: logId,
    seq: entries.length,
    kind,
    ts: now.toISOString().replace(".000Z", "Z"),
    prev_hash: prev ? prev.entry_hash : ZERO_HASH,
    payload_hash: sha256Hex(canonicalize(payload)),
    signer: PLACEHOLDER_ENGINE_DID,
  };
  // The union type cannot be built generically from K; the shape is checked by validateLogEntry in tests.
  const entry = { ...header, kind, payload, entry_hash: entryHash(header), signature: PLACEHOLDER_SIGNATURE } as unknown as LogEntry;
  return [...entries, entry];
}

export function headOf(entries: readonly LogEntry[]): Checkpoint | null {
  const last = entries.at(-1);
  return last ? { log_id: last.log_id, seq: last.seq, entry_hash: last.entry_hash } : null;
}

const fail = (failedSeq: number, reason: VerifyFailure): VerifyResult => ({ ok: false, failedSeq, reason });

function checkEntry(entry: LogEntry, index: number, prevHash: string): VerifyResult | null {
  if (!validateLogEntry(entry).ok) return fail(index, "SCHEMA");
  if (entry.seq !== index) return fail(index, "SEQ");
  if (entry.prev_hash !== prevHash) return fail(index, "PREV_HASH");
  if (entry.payload_hash !== sha256Hex(canonicalize(entry.payload))) return fail(index, "PAYLOAD_HASH");
  if (entry.entry_hash !== entryHash(entry)) return fail(index, "ENTRY_HASH");
  return null;
}

/** Checks 1 to 5 and 8 of docs/02 section 11. Never throws on malformed input: it fails at the first bad entry. */
export function verifyMockChain(entries: readonly unknown[], checkpoint?: Checkpoint | null): VerifyResult {
  let prevHash = ZERO_HASH;
  for (const [index, raw] of entries.entries()) {
    const entry = raw as LogEntry;
    const bad = checkEntry(entry, index, prevHash);
    if (bad) return bad;
    prevHash = entry.entry_hash;
  }
  const last = entries.at(-1) as LogEntry | undefined;
  if (!last) return fail(0, "TRUNCATED");
  if (checkpoint && (checkpoint.seq > last.seq || (entries[checkpoint.seq] as LogEntry).entry_hash !== checkpoint.entry_hash)) {
    return fail(Math.min(checkpoint.seq, last.seq + 1), "TRUNCATED");
  }
  return { ok: true, head: { log_id: last.log_id, seq: last.seq, entry_hash: last.entry_hash } };
}

export interface TamperedCopy {
  readonly entries: readonly LogEntry[];
  readonly seq: number;
  readonly field: string;
  readonly before: number;
  readonly after: number;
}

const TARGETS: readonly { readonly kind: LogEntryKind; readonly path: readonly string[] }[] = [
  { kind: "DECISION", path: ["cart", "total_minor"] },
  { kind: "CARD_MINTED", path: ["limit_minor"] },
  { kind: "CARD_EVENT", path: ["amount_minor"] },
  { kind: "MANDATE_SEALED", path: ["credentialSubject", "rules", "budget", "amount_minor"] },
];

function readPath(obj: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

function writePath(obj: unknown, path: readonly [string, ...string[]], value: number): unknown {
  const [head, ...rest] = path;
  const record = { ...(obj as Record<string, unknown>) };
  record[head] = rest.length === 0 ? value : writePath(record[head], rest as [string, ...string[]], value);
  return record;
}

/** One decimal digit changes ("one byte flipped"): the first digit of the amount goes up by one, wrapping 9 to 1. */
function flipLeadingDigit(value: number): number {
  const text = String(value);
  const digit = Number(text[0]);
  return Number(`${digit === 9 ? 1 : digit + 1}${text.slice(1)}`);
}

/** A tampered copy of the log; the stored log is untouched. Null when no entry carries an amount to change. */
export function tamperCopy(entries: readonly LogEntry[]): TamperedCopy | null {
  for (const target of TARGETS) {
    const index = entries.findIndex((e) => e.kind === target.kind && typeof readPath(e.payload, target.path) === "number");
    const entry = entries[index];
    if (index < 0 || !entry) continue;
    const before = readPath(entry.payload, target.path) as number;
    const after = flipLeadingDigit(before);
    const payload = writePath(entry.payload, target.path as [string, ...string[]], after);
    const changed = { ...entry, payload } as LogEntry;
    return {
      entries: entries.map((e, i) => (i === index ? changed : e)),
      seq: index,
      field: target.path.join("."),
      before,
      after,
    };
  }
  return null;
}
