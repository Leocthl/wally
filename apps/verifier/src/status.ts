// Pure rendering of a verifier result. Owner: lane C. Types only from core; verifyChain comes from @laisee/core/verify.
import type { VerifyResult } from "@laisee/core/ports";

export function statusLine(result: VerifyResult): string {
  return result.ok
    ? `PASS: chain verifies through seq ${result.head.seq}`
    : `FAIL at seq ${result.failedSeq}: ${result.reason}`;
}
