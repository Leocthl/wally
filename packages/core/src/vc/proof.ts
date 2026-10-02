// Data Integrity proof, cryptosuite eddsa-jcs-2022, for the AgentDelegationCredential (D11).
// unsecuredDocument = credential without proof; proofConfig = proof options (no proofValue) plus the
// document's @context; hashData = SHA-256(JCS(proofConfig)) || SHA-256(JCS(unsecuredDocument));
// proofValue = 'z' + base58btc(Ed25519.sign(hashData)). Browser-safe.
import { concat, fromMultibase58btc, toMultibase58btc } from "../crypto/bytes";
import { parseDidKey, verificationMethodId } from "../crypto/did-key";
import { ED25519_SIGNATURE_BYTES, verifyEd25519 } from "../crypto/ed25519";
import { errorMessage } from "../crypto/errors";
import { jcsSha256 } from "../crypto/jcs";
import type { MandateCredential } from "../generated";
import type { Signer } from "../ports";
import { formatIssues, validateMandateCredential } from "../schema";

export const CRYPTOSUITE = "eddsa-jcs-2022";

export type UnsignedMandateCredential = Omit<MandateCredential, "proof">;
type Proof = MandateCredential["proof"];
type ProofOptions = Omit<Proof, "proofValue">;

export type CredentialFailure = "SCHEMA" | "WRONG_ISSUER" | "ISSUER_KEY" | "VERIFICATION_METHOD" | "PROOF_VALUE" | "SIGNATURE";
export type CredentialCheck =
  | { readonly valid: true; readonly reason: null }
  | { readonly valid: false; readonly reason: CredentialFailure; readonly detail: string };

export interface SignCredentialOptions {
  /** proof.created (RFC 3339 UTC). */
  readonly created: Date;
}

export class CredentialSignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialSignError";
  }
}

function hashData(unsecured: UnsignedMandateCredential, options: ProofOptions): Uint8Array {
  const proofConfig = { ...options, "@context": unsecured["@context"] };
  return concat(jcsSha256(proofConfig), jcsSha256(unsecured));
}

/** Seals the mandate: the signer must be the issuer (delegator). Any existing proof is replaced. */
export function signMandateCredential(
  unsigned: UnsignedMandateCredential,
  signer: Signer,
  opts: SignCredentialOptions,
): MandateCredential {
  const { proof: _stale, ...rest } = unsigned as UnsignedMandateCredential & { proof?: unknown };
  const doc = structuredClone(rest);
  if (doc.issuer !== signer.did) throw new CredentialSignError("the signer must be the credential issuer");
  const options: ProofOptions = {
    type: "DataIntegrityProof",
    cryptosuite: CRYPTOSUITE,
    created: opts.created.toISOString(),
    verificationMethod: verificationMethodId(signer.did),
    proofPurpose: "assertionMethod",
  };
  const vc = { ...doc, proof: { ...options, proofValue: toMultibase58btc(signer.sign(hashData(doc, options))) } };
  const check = validateMandateCredential(vc);
  if (!check.ok) throw new CredentialSignError(`credential fails the schema: ${formatIssues(check.errors)}`);
  return check.value;
}

const fail = (reason: CredentialFailure, detail: string): CredentialCheck => ({ valid: false, reason, detail });

function checkProofValue(vc: MandateCredential, publicKey: Uint8Array): CredentialCheck {
  let signature: Uint8Array;
  try {
    signature = fromMultibase58btc(vc.proof.proofValue);
  } catch (err) {
    return fail("PROOF_VALUE", errorMessage(err));
  }
  if (signature.length !== ED25519_SIGNATURE_BYTES) return fail("PROOF_VALUE", "proofValue is not a 64-byte signature");
  const { proof, ...unsecured } = vc;
  const { proofValue: _value, ...options } = proof;
  let data: Uint8Array;
  try {
    data = hashData(unsecured, options);
  } catch (err) {
    return fail("SCHEMA", errorMessage(err)); // e.g. a lone surrogate has no canonical form
  }
  return verifyEd25519(signature, data, publicKey)
    ? { valid: true, reason: null }
    : fail("SIGNATURE", "proof does not verify against the issuer key");
}

/**
 * R1 input (DecideContext.mandateProofValid) and verifier step 7. Never throws. With expectedIssuer,
 * the issuer must be that delegator. The schema pins proof @context (when present) to the document's.
 */
export function verifyMandateCredential(input: unknown, opts: { readonly expectedIssuer?: string } = {}): CredentialCheck {
  const parsed = validateMandateCredential(input);
  if (!parsed.ok) return fail("SCHEMA", formatIssues(parsed.errors));
  const vc = parsed.value;
  if (opts.expectedIssuer !== undefined && vc.issuer !== opts.expectedIssuer) {
    return fail("WRONG_ISSUER", "issuer is not the expected delegator");
  }
  const publicKey = parseDidKey(vc.issuer);
  if (publicKey === null) return fail("ISSUER_KEY", "issuer is not an Ed25519 did:key");
  if (vc.proof.verificationMethod !== verificationMethodId(vc.issuer)) {
    return fail("VERIFICATION_METHOD", "verificationMethod is not <issuer>#<issuer key>");
  }
  return checkProofValue(vc, publicKey);
}
