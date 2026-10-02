// verifyChain (docs/02 section 11), pure and browser-safe. Per entry, in order: 1 SCHEMA, 2 SEQ,
// 3 PREV_HASH, 4 PAYLOAD_HASH, 5 ENTRY_HASH, 6 SIGNATURE, then structure (SCHEMA: seq 0 is the only
// MANDATE_SEALED, one log_id per log) and 7 PAYLOAD_SIGNATURE; after the last entry, 8 TRUNCATED against
// the external checkpoint. Returns the first failing seq (line index) and reason. Never throws.
import { fromBase64url } from "../crypto/bytes";
import { parseDidKey } from "../crypto/did-key";
import { verifyEd25519 } from "../crypto/ed25519";
import { errorMessage } from "../crypto/errors";
import type { LogEntry } from "../generated";
import { checkpointOf, parseCheckpoint } from "../log/checkpoint";
import { entryHash, GENESIS_PREV_HASH, logSigningMessage, payloadHash } from "../log/hashing";
import type { Checkpoint, VerifyChain } from "../ports";
import { formatIssues, validateLogEntry } from "../schema";
import { checkDelegated, checkSeal, type Delegated, type Sealed } from "./delegated";
import { fail, type PublicKeys, type VerifyReport } from "./report";

type Integrity = { readonly ok: true; readonly entry: LogEntry } | { readonly ok: false; readonly report: VerifyReport };

function engineSignatureValid(entry: LogEntry): boolean {
  const publicKey = parseDidKey(entry.signer);
  if (publicKey === null) return false;
  try {
    return verifyEd25519(fromBase64url(entry.signature), logSigningMessage(entry.entry_hash), publicKey);
  } catch {
    return false; // non-canonical base64url: not a valid signature
  }
}

function safeHash(compute: () => string): string {
  try {
    return compute();
  } catch (err) {
    return `unhashable: ${errorMessage(err)}`;
  }
}

/** Steps 1-6 for the entry at `index`, given the previous entry_hash. */
function checkIntegrity(raw: unknown, index: number, prevHash: string, engine: ReadonlySet<string>): Integrity {
  const parsed = validateLogEntry(raw);
  if (!parsed.ok) return { ok: false, report: fail(index, "SCHEMA", formatIssues(parsed.errors)) };
  const entry = parsed.value;
  const no = (reason: Parameters<typeof fail>[1], detail: string): Integrity => ({ ok: false, report: fail(index, reason, detail) });
  if (entry.seq !== index) return no("SEQ", `line ${index} holds seq ${entry.seq}`);
  if (entry.prev_hash !== prevHash) return no("PREV_HASH", `prev_hash does not match the entry_hash of seq ${index - 1}`);
  if (safeHash(() => payloadHash(entry.payload)) !== entry.payload_hash) return no("PAYLOAD_HASH", "payload_hash != SHA-256(JCS(payload))");
  if (safeHash(() => entryHash(entry)) !== entry.entry_hash) return no("ENTRY_HASH", "entry_hash != SHA-256(JCS(header))");
  if (!engine.has(entry.signer)) return no("SIGNATURE", "signer is not a listed engine key");
  if (!engineSignatureValid(entry)) return no("SIGNATURE", "engine signature over laisee.log.v1:<entry_hash> does not verify");
  return { ok: true, entry };
}

function checkHead(entries: readonly LogEntry[], logId: string, checkpoint: Checkpoint): VerifyReport | null {
  const parsed = parseCheckpoint(checkpoint);
  if (!parsed.ok) return fail(0, "TRUNCATED", `checkpoint is malformed: ${formatIssues(parsed.errors)}`);
  const cp = parsed.value;
  if (cp.log_id !== logId) return fail(0, "TRUNCATED", `checkpoint is for ${cp.log_id}, not ${logId}`);
  const at = entries[cp.seq];
  if (at === undefined) return fail(entries.length, "TRUNCATED", `checkpoint names seq ${cp.seq}; the log ends at seq ${entries.length - 1}`);
  if (at.entry_hash !== cp.entry_hash) return fail(cp.seq, "TRUNCATED", `entry_hash at seq ${cp.seq} differs from the checkpoint (rewritten)`);
  return null;
}

function structure(entry: LogEntry, index: number, sealed: Sealed | null): VerifyReport | null {
  if (index === 0 && entry.kind !== "MANDATE_SEALED") return fail(0, "SCHEMA", "seq 0 must be MANDATE_SEALED");
  if (index > 0 && entry.kind === "MANDATE_SEALED") return fail(index, "SCHEMA", "MANDATE_SEALED only appears at seq 0");
  if (sealed !== null && entry.log_id !== sealed.logId) return fail(index, "SCHEMA", `log_id ${entry.log_id} differs from seq 0 (${sealed.logId})`);
  return null;
}

export function verifyChain(entries: readonly unknown[], publicKeys: PublicKeys, headCheckpoint?: Checkpoint): VerifyReport {
  if (entries.length === 0) return fail(0, "TRUNCATED", "log is empty: seq 0 (MANDATE_SEALED) is missing");
  const engine = new Set(publicKeys.engine);
  const verified: LogEntry[] = [];
  let sealed: Sealed | null = null;
  for (const [index, raw] of entries.entries()) {
    const integrity = checkIntegrity(raw, index, verified.at(-1)?.entry_hash ?? GENESIS_PREV_HASH, engine);
    if (!integrity.ok) return integrity.report;
    const { entry } = integrity;
    const broken = structure(entry, index, sealed);
    if (broken) return broken;
    const delegated: Delegated = sealed === null ? checkSeal(entry, publicKeys.delegator) : checkDelegated(entry, sealed);
    if (!delegated.ok) return fail(index, "PAYLOAD_SIGNATURE", delegated.detail);
    sealed = delegated.sealed;
    verified.push(entry);
  }
  const last = verified.at(-1) as LogEntry;
  const truncated = headCheckpoint === undefined ? null : checkHead(verified, last.log_id, headCheckpoint);
  return truncated ?? { ok: true, head: checkpointOf(last) };
}

/** verifyChain conforms to the VerifyChain port. */
export const _verifyChainConforms: VerifyChain = verifyChain;
