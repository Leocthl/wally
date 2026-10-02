// @laisee/core/log: appendEntry, hashing, JSONL, head checkpoint, delegator-signed payloads, I8 guard.
// Browser-safe. The Node-only FileLogStore lives at @laisee/core/log/file.
export { LogError, type LogErrorCode } from "./errors";
export { assertLogId, LOG_ID_RE, logIdForMandate } from "./ids";
export {
  entryHash,
  entryHashInput,
  GENESIS_PREV_HASH,
  LOG_ENTRY_VERSION,
  LOG_SIGNATURE_DOMAIN,
  logSigningMessage,
  payloadHash,
  type EntryHashInput,
} from "./hashing";
export { toJsonl, toJsonlLine } from "./jsonl";
export { findCardData, luhnValid } from "./i8";
export { checkpointOf, headCheckpoint, parseCheckpoint } from "./checkpoint";
export {
  DelegatorSignError,
  delegatorSigningMessage,
  RESOLVE_DOMAIN,
  REVOKE_DOMAIN,
  signEscalationAnswer,
  signRevocation,
  verifyEscalationAnswer,
  verifyRevocation,
  type DelegatorCheck,
  type DelegatorDomain,
  type DelegatorFailure,
  type EscalationAnswerInput,
  type RevocationInput,
} from "./delegator";
export { appendEntry, buildEntry, type BuildEntryArgs } from "./append";
