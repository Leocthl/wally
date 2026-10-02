import type { Checkpoint, VerifyFailure } from "../ports";

/** VerifyResult (ports.ts) plus a human-readable detail on failure (CLI, verifier page); assignable to it. */
export type VerifyReport =
  | { readonly ok: true; readonly head: Checkpoint }
  | { readonly ok: false; readonly failedSeq: number; readonly reason: VerifyFailure; readonly detail: string };

export function fail(failedSeq: number, reason: VerifyFailure, detail: string): VerifyReport {
  return { ok: false, failedSeq, reason, detail };
}

export interface PublicKeys {
  /** Engine (operator) did:keys allowed to sign log entries. */
  readonly engine: readonly string[];
  /** The delegator did:key: credential issuer, revocation and answer signer. */
  readonly delegator: string;
}
