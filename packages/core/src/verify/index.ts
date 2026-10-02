// @laisee/core/verify: offline log verifier (docs/02 section 11), pure and browser-safe. The only core
// entry point apps/verifier may import. No node: built-ins, no secret-key handling.
export { verifyChain } from "./chain";
export { parseLogText, verifyLogText, type ParsedLog } from "./text";
export { parsePublicKeys } from "./keys";
export type { PublicKeys, VerifyReport } from "./report";
export { checkpointOf, parseCheckpoint } from "../log/checkpoint";
export { verifyEscalationAnswer, verifyRevocation, type AnswerBinding, type DelegatorCheck } from "../log/delegator";
export { cartSha256 } from "../log/cart-sha256";
export {
  verifyMandateCredential,
  type CredentialCheck,
  type CredentialFailure,
  type VerifyCredentialOptions,
} from "../vc/proof";
export type { Checkpoint, VerifyFailure, VerifyResult } from "../ports";
