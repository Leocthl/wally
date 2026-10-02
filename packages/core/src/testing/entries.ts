// Schema-valid log entries with PLACEHOLDER hashes and signature, for wiring tests only.
// They do not verify. Real entries come from lane A's appendEntry (crypto + log).
import type { LogEntryKind, LogEntryOf, LogPayloadByKind } from "../generated";

export const PLACEHOLDER_SIGNATURE = "SIMULATEDplaceholderSignatureNotVerifiable".padEnd(86, "A");
export const PLACEHOLDER_ENGINE_DID = "did:key:z6MkFakeEngineKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

const ZERO_HASH = "0".repeat(64);

function placeholderHash(seq: number, salt: string): string {
  return `${salt}${seq.toString(16)}`.padStart(64, "0");
}

export interface PlaceholderEntryArgs<K extends LogEntryKind> {
  readonly logId: string;
  readonly seq: number;
  readonly kind: K;
  readonly payload: LogPayloadByKind[K];
  readonly ts: Date;
}

export function placeholderEntry<K extends LogEntryKind>(args: PlaceholderEntryArgs<K>): LogEntryOf<K> {
  return {
    v: 1,
    log_id: args.logId,
    seq: args.seq,
    kind: args.kind,
    ts: args.ts.toISOString(),
    prev_hash: args.seq === 0 ? ZERO_HASH : placeholderHash(args.seq - 1, "e"),
    payload: args.payload,
    payload_hash: placeholderHash(args.seq, "a"),
    entry_hash: placeholderHash(args.seq, "e"),
    signer: PLACEHOLDER_ENGINE_DID,
    signature: PLACEHOLDER_SIGNATURE,
  };
}
