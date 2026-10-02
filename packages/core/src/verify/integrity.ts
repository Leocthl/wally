// Verify-on-open: the orchestrator calls assertLogIntegrity on a stored log before folding it, so a log edited
// on disk (or written by a buggy run) is refused instead of driving decisions. Same verifyChain as the offline
// verifier, with the pinned public keys and, when it has one, the last published checkpoint. Browser-safe.
import { LogError } from "../log/errors";
import type { Checkpoint } from "../ports";
import { verifyChain } from "./chain";
import type { PublicKeys, VerifyReport } from "./report";

type Failed = Extract<VerifyReport, { readonly ok: false }>;

/** A stored log that does not verify. `report` names the first failing seq and reason. */
export class LogIntegrityError extends LogError {
  readonly report: Failed;

  constructor(report: Failed) {
    super("INTEGRITY", `log does not verify at seq ${report.failedSeq}: ${report.reason}: ${report.detail}`);
    this.name = "LogIntegrityError";
    this.report = report;
  }
}

/** The verified head of `entries`; throws LogIntegrityError when any check fails (fail closed, I5). */
export function assertLogIntegrity(entries: readonly unknown[], keys: PublicKeys, checkpoint?: Checkpoint): Checkpoint {
  const report = verifyChain(entries, keys, checkpoint);
  if (!report.ok) throw new LogIntegrityError(report);
  return report.head;
}
