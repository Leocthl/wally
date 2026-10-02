import type { Checkpoint, VerifyFailure, VerifyResult } from "../ports";

/** VerifyResult plus a human-readable detail on failure (CLI, verifier page). Assignable to VerifyResult. */
export type VerifyReport =
  | { readonly ok: true; readonly head: Checkpoint }
  | { readonly ok: false; readonly failedSeq: number; readonly reason: VerifyFailure; readonly detail: string };

export function fail(failedSeq: number, reason: VerifyFailure, detail: string): VerifyReport {
  return { ok: false, failedSeq, reason, detail };
}

/** Compile-time check that a VerifyReport is a VerifyResult (ports.ts). */
export const asVerifyResult = (report: VerifyReport): VerifyResult => report;

export interface PublicKeys {
  /** Engine (operator) did:keys allowed to sign log entries. */
  readonly engine: readonly string[];
  /** The delegator did:key: credential issuer, revocation and answer signer. */
  readonly delegator: string;
}
