// appendEntry (AppendEntry port, I7): builds the next entry from the store head, hashes and signs it with
// the engine Signer, validates it, then appends. Card data (I8), oversized rule inputs and over-long lines are
// refused. Any failure throws before the store is touched, so the caller fails closed (I5) and performs no
// side effect.
import { toBase64url } from "../crypto/bytes";
import type { LogEntry, LogEntryKind, LogEntryOf, LogPayloadByKind, MandateCredential } from "../generated";
import type { AppendEntry, Checkpoint, Signer } from "../ports";
import { formatIssues, validateLogEntry } from "../schema";
import { mandateIdFromCredentialId } from "../vc/mandate";
import { headCheckpoint } from "./checkpoint";
import { LogError } from "./errors";
import { entryHash, GENESIS_PREV_HASH, LOG_ENTRY_VERSION, logSigningMessage, payloadHash } from "./hashing";
import { findCardData } from "./i8";
import { assertLogId, logIdForMandate } from "./ids";
import { toJsonlLine } from "./jsonl";
import { decisionInputsProblem, lineProblem } from "./limits";

/** Schema issues kept in an error message. */
const MAX_ISSUES = 3;

export interface BuildEntryArgs<K extends LogEntryKind> {
  readonly head: Checkpoint | null;
  readonly signer: Signer;
  readonly logId: string;
  readonly kind: K;
  readonly payload: LogPayloadByKind[K];
  readonly now: Date;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function plainCopy<T>(payload: T): T {
  try {
    return structuredClone(payload);
  } catch {
    throw new LogError("SCHEMA", "payload is not plain JSON data");
  }
}

function sealedLogId(payload: unknown): string {
  try {
    return logIdForMandate(mandateIdFromCredentialId((payload as MandateCredential).id));
  } catch {
    throw new LogError("LOG_ID", "MANDATE_SEALED payload has no valid credential id");
  }
}

function checkPlacement(kind: LogEntryKind, seq: number, logId: string, payload: unknown): void {
  if ((seq === 0) !== (kind === "MANDATE_SEALED")) {
    throw new LogError("KIND", "seq 0 must be MANDATE_SEALED and MANDATE_SEALED only appears at seq 0");
  }
  if (kind === "MANDATE_SEALED" && sealedLogId(payload) !== logId) {
    throw new LogError("LOG_ID", `mandate credential belongs to ${sealedLogId(payload)}, not ${logId}`);
  }
}

/** Pure: the signed entry that would follow `head`. Throws LogError when it must not be written. */
export function buildEntry<K extends LogEntryKind>(args: BuildEntryArgs<K>): LogEntryOf<K> {
  const { head, signer, logId, kind, now } = args;
  assertLogId(logId);
  if (head !== null && head.log_id !== logId) throw new LogError("HEAD", `head belongs to ${head.log_id}, not ${logId}`);
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new LogError("CLOCK", "now is not a valid Date");
  const seq = head === null ? 0 : head.seq + 1;
  const payload = plainCopy(args.payload);
  checkPlacement(kind, seq, logId, payload);
  const finding = findCardData(payload);
  if (finding !== null) throw new LogError("CARD_DATA", `refused (I8): ${finding}`);
  const oversized = kind === "DECISION" ? decisionInputsProblem(payload as LogPayloadByKind["DECISION"]) : null;
  if (oversized !== null) throw new LogError("LIMIT", `refused: ${oversized}`);
  const header = {
    v: LOG_ENTRY_VERSION,
    log_id: logId,
    seq,
    kind,
    ts: now.toISOString(),
    prev_hash: head === null ? GENESIS_PREV_HASH : head.entry_hash,
    payload_hash: payloadHash(payload),
    signer: signer.did,
  } as const;
  const hash = entryHash(header);
  const entry = { ...header, payload, entry_hash: hash, signature: toBase64url(signer.sign(logSigningMessage(hash))) };
  const check = validateLogEntry(entry);
  if (!check.ok) throw new LogError("SCHEMA", formatIssues(check.errors.slice(0, MAX_ISSUES)));
  const tooLong = lineProblem(toJsonlLine(entry as LogEntry));
  if (tooLong !== null) throw new LogError("LIMIT", `refused: ${tooLong}`);
  return deepFreeze(entry) as LogEntryOf<K>;
}

export const appendEntry: AppendEntry = async (store, signer, logId, kind, payload, now): Promise<LogEntry> => {
  assertLogId(logId);
  const head = await headCheckpoint(store, logId);
  const entry = buildEntry({ head, signer, logId, kind, payload, now });
  await store.append(entry as LogEntry);
  return entry as LogEntry;
};
