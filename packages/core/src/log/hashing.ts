// Bytes hashed and signed for one log line (schemas/log-entry.schema.json):
// payload_hash = hex SHA-256(JCS(payload)); entry_hash = hex SHA-256(JCS({v, log_id, seq, kind, ts,
// prev_hash, payload_hash, signer})); signature = base64url(Ed25519(UTF-8('laisee.log.v1:' + entry_hash))).
import { utf8 } from "../crypto/bytes";
import { jcsSha256Hex } from "../crypto/jcs";
import type { LogEntry } from "../generated";

/** prev_hash of seq 0: 64 '0' characters. */
export const GENESIS_PREV_HASH = "0".repeat(64);
export const LOG_SIGNATURE_DOMAIN = "laisee.log.v1";
export const LOG_ENTRY_VERSION = 1;

export type EntryHashInput = Pick<LogEntry, "v" | "log_id" | "seq" | "kind" | "ts" | "prev_hash" | "payload_hash" | "signer">;

export function payloadHash(payload: unknown): string {
  return jcsSha256Hex(payload);
}

/** Exactly the eight header fields covered by entry_hash, in a new object. */
export function entryHashInput(entry: EntryHashInput): EntryHashInput {
  const { v, log_id, seq, kind, ts, prev_hash, payload_hash, signer } = entry;
  return { v, log_id, seq, kind, ts, prev_hash, payload_hash, signer };
}

export function entryHash(entry: EntryHashInput): string {
  return jcsSha256Hex(entryHashInput(entry));
}

/** Message the engine key signs for an entry. */
export function logSigningMessage(entryHashHex: string): Uint8Array {
  return utf8(`${LOG_SIGNATURE_DOMAIN}:${entryHashHex}`);
}
