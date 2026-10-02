// Data Integrity proof, cryptosuite eddsa-jcs-2022 (W3C vc-di-eddsa REC 15 May 2025, section 3.3), for the
// AgentDelegationCredential (D11). Create Proof (3.3.1): proof = options plus the document's @context (step 2);
// hashData = SHA-256(JCS(proof without proofValue)) || SHA-256(JCS(unsecuredDocument)), config hash first;
// proofValue = 'z' + base58btc(Ed25519.sign(hashData)). Verify Proof (3.3.2): the proof is hashed exactly as
// carried; its @context must equal the document's (stricter than the REC's prefix rule: fail closed).
// did:key is self-certifying, so the verifier needs the pinned delegator: no pin, no trust. Browser-safe.
import { concat, fromMultibase58btc, toMultibase58btc } from "../crypto/bytes";
import { parseDidKey, verificationMethodId } from "../crypto/did-key";
import { ED25519_SIGNATURE_BYTES, verifyEd25519 } from "../crypto/ed25519";
import { clipMessage, errorMessage } from "../crypto/errors";
import { jcsSha256 } from "../crypto/jcs";
import type { MandateCredential } from "../generated";
import type { Signer } from "../ports";
import { formatIssues, validateMandateCredential } from "../schema";

export const CRYPTOSUITE = "eddsa-jcs-2022";
/** Schema issues and characters kept in a failure detail (display limits, not policy). */
const MAX_ISSUES = 3;
const MAX_DETAIL_CHARS = 400;

export type UnsignedMandateCredential = Omit<MandateCredential, "proof">;
type Proof = MandateCredential["proof"];
/** The proof without proofValue: what Create Proof hashes, and what Verify Proof rebuilds from the carried proof. */
type ProofConfig = Omit<Proof, "proofValue">;

export type CredentialFailure =
  | "SCHEMA"
  | "ISSUER_UNPINNED"
  | "WRONG_ISSUER"
  | "ISSUER_KEY"
  | "VERIFICATION_METHOD"
  | "PROOF_VALUE"
  | "SIGNATURE";
export type CredentialCheck =
  | { readonly valid: true; readonly reason: null }
  | { readonly valid: false; readonly reason: CredentialFailure; readonly detail: string };

export interface SignCredentialOptions {
  /** proof.created (RFC 3339 UTC). */
  readonly created: Date;
}

export interface VerifyCredentialOptions {
  /** The pinned delegator did:key (public keys file, sealed packet). Required: without it any self-issued credential verifies. */
  readonly expectedIssuer: string;
}

export class CredentialSignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialSignError";
  }
}

function hashData(unsecured: UnsignedMandateCredential, proofConfig: ProofConfig): Uint8Array {
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
  const proofConfig: ProofConfig = {
    "@context": structuredClone(doc["@context"]),
    type: "DataIntegrityProof",
    cryptosuite: CRYPTOSUITE,
    created: opts.created.toISOString(),
    verificationMethod: verificationMethodId(signer.did),
    proofPurpose: "assertionMethod",
  };
  const vc = { ...doc, proof: { ...proofConfig, proofValue: toMultibase58btc(signer.sign(hashData(doc, proofConfig))) } };
  const check = validateMandateCredential(vc);
  if (!check.ok) throw new CredentialSignError(`credential fails the schema: ${formatIssues(check.errors)}`);
  return check.value;
}

const fail = (reason: CredentialFailure, detail: string): CredentialCheck => ({ valid: false, reason, detail });

function sameContext(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function checkProofValue(vc: MandateCredential, publicKey: Uint8Array): CredentialCheck {
  let signature: Uint8Array;
  try {
    signature = fromMultibase58btc(vc.proof.proofValue);
  } catch (err) {
    return fail("PROOF_VALUE", errorMessage(err));
  }
  if (signature.length !== ED25519_SIGNATURE_BYTES) return fail("PROOF_VALUE", "proofValue is not a 64-byte signature");
  const { proof, ...unsecured } = vc;
  const { proofValue: _value, ...proofConfig } = proof; // exactly as carried, @context included (3.3.2 step 2)
  if (!sameContext(proofConfig["@context"], unsecured["@context"])) return fail("SCHEMA", "proof @context differs from the document @context");
  let data: Uint8Array;
  try {
    data = hashData(unsecured, proofConfig);
  } catch (err) {
    return fail("SCHEMA", errorMessage(err)); // e.g. a lone surrogate has no canonical form
  }
  return verifyEd25519(signature, data, publicKey)
    ? { valid: true, reason: null }
    : fail("SIGNATURE", "proof does not verify against the issuer key");
}

function pinnedIssuer(opts: unknown): string | null {
  if (opts === null || typeof opts !== "object") return null;
  const pinned = (opts as { readonly expectedIssuer?: unknown }).expectedIssuer;
  return typeof pinned === "string" && pinned !== "" ? pinned : null;
}

/**
 * R1 input (DecideContext.mandateProofValid) and verifier step 7. Never throws. The issuer must be the pinned
 * delegator: a missing pin is ISSUER_UNPINNED (fail closed), never "trust the key the credential names".
 */
export function verifyMandateCredential(input: unknown, opts: VerifyCredentialOptions): CredentialCheck {
  const expectedIssuer = pinnedIssuer(opts);
  if (expectedIssuer === null) return fail("ISSUER_UNPINNED", "no pinned delegator did:key: a did:key credential cannot vouch for itself");
  const parsed = validateMandateCredential(input);
  if (!parsed.ok) return fail("SCHEMA", clipMessage(formatIssues(parsed.errors.slice(0, MAX_ISSUES)), MAX_DETAIL_CHARS));
  const vc = parsed.value;
  if (vc.issuer !== expectedIssuer) return fail("WRONG_ISSUER", "issuer is not the pinned delegator");
  const publicKey = parseDidKey(vc.issuer);
  if (publicKey === null) return fail("ISSUER_KEY", "issuer is not an Ed25519 did:key");
  if (vc.proof.verificationMethod !== verificationMethodId(vc.issuer)) {
    return fail("VERIFICATION_METHOD", "verificationMethod is not <issuer>#<issuer key>");
  }
  return checkProofValue(vc, publicKey);
}
