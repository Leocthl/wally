// @laisee/core/vc: AgentDelegationCredential (W3C VC 2.0, Data Integrity eddsa-jcs-2022). Browser-safe.
export {
  credentialIdForMandate,
  CredentialIdError,
  MANDATE_URN_PREFIX,
  mandateFromCredential,
  mandateIdFromCredentialId,
} from "./mandate";
export {
  CredentialSignError,
  CRYPTOSUITE,
  signMandateCredential,
  verifyMandateCredential,
  type CredentialCheck,
  type CredentialFailure,
  type SignCredentialOptions,
  type UnsignedMandateCredential,
} from "./proof";
