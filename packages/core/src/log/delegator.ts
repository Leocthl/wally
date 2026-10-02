// Delegator-signed payloads (docs/02 section 11): revocation 'laisee.revoke.v1' (MANDATE_REVOKED) and
// escalation answer 'laisee.resolve.v1' (DECISION.escalation.answer). Signature over UTF-8 of
// '<domain>:' + hex SHA-256(JCS(object without signature)), base64url without padding. Browser-safe.
import { fromBase64url, toBase64url, utf8 } from "../crypto/bytes";
import { parseDidKey } from "../crypto/did-key";
import { verifyEd25519 } from "../crypto/ed25519";
import { jcsSha256Hex } from "../crypto/jcs";
import type { EscalationAnswer, Revocation } from "../generated";
import type { Signer } from "../ports";
import { formatIssues, validateEscalationAnswer, validateRevocation, type Validator } from "../schema";

export const REVOKE_DOMAIN = "laisee.revoke.v1";
export const RESOLVE_DOMAIN = "laisee.resolve.v1";
export type DelegatorDomain = typeof REVOKE_DOMAIN | typeof RESOLVE_DOMAIN;

export type DelegatorFailure = "SCHEMA" | "SIGNER" | "SIGNATURE";
export type DelegatorCheck =
  | { readonly valid: true; readonly reason: null }
  | { readonly valid: false; readonly reason: DelegatorFailure; readonly detail: string };

export class DelegatorSignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelegatorSignError";
  }
}

export function delegatorSigningMessage(domain: DelegatorDomain, unsigned: object): Uint8Array {
  return utf8(`${domain}:${jcsSha256Hex(unsigned)}`);
}

function signPayload<T extends { signer: string; signature: string }>(
  domain: DelegatorDomain,
  unsigned: Omit<T, "signature">,
  signer: Signer,
  validate: Validator<T>,
): T {
  const signed = { ...unsigned, signature: toBase64url(signer.sign(delegatorSigningMessage(domain, unsigned))) };
  const check = validate(signed);
  if (!check.ok) throw new DelegatorSignError(`${domain} payload fails the schema: ${formatIssues(check.errors)}`);
  return check.value;
}

function verifyPayload<T extends { signer: string; signature: string }>(
  domain: DelegatorDomain,
  input: unknown,
  delegatorDid: string,
  validate: Validator<T>,
): DelegatorCheck {
  const parsed = validate(input);
  if (!parsed.ok) return { valid: false, reason: "SCHEMA", detail: formatIssues(parsed.errors) };
  const { signature, ...unsigned } = parsed.value;
  if (unsigned.signer !== delegatorDid) return { valid: false, reason: "SIGNER", detail: "signer is not the mandate delegator" };
  const publicKey = parseDidKey(delegatorDid);
  let sig: Uint8Array | null;
  try {
    sig = fromBase64url(signature);
  } catch {
    sig = null; // a non-canonical signature is simply invalid
  }
  const ok = publicKey !== null && sig !== null && verifyEd25519(sig, delegatorSigningMessage(domain, unsigned), publicKey);
  return ok ? { valid: true, reason: null } : { valid: false, reason: "SIGNATURE", detail: `${domain} signature does not verify` };
}

export interface RevocationInput {
  readonly mandate_id: string;
  readonly revoked_at: Date;
  readonly reason?: string;
}

export function signRevocation(input: RevocationInput, signer: Signer): Revocation {
  const unsigned = {
    mandate_id: input.mandate_id,
    revoked_at: input.revoked_at.toISOString(),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    signer: signer.did,
  };
  return signPayload<Revocation>(REVOKE_DOMAIN, unsigned, signer, validateRevocation);
}

export function verifyRevocation(input: unknown, delegatorDid: string): DelegatorCheck {
  return verifyPayload<Revocation>(REVOKE_DOMAIN, input, delegatorDid, validateRevocation);
}

export interface EscalationAnswerInput {
  readonly decision_id: string;
  readonly choice: EscalationAnswer["choice"];
  readonly answered_at: Date;
}

export function signEscalationAnswer(input: EscalationAnswerInput, signer: Signer): EscalationAnswer {
  const unsigned = {
    decision_id: input.decision_id,
    choice: input.choice,
    answered_at: input.answered_at.toISOString(),
    signer: signer.did,
  };
  return signPayload<EscalationAnswer>(RESOLVE_DOMAIN, unsigned, signer, validateEscalationAnswer);
}

export function verifyEscalationAnswer(input: unknown, delegatorDid: string): DelegatorCheck {
  return verifyPayload<EscalationAnswer>(RESOLVE_DOMAIN, input, delegatorDid, validateEscalationAnswer);
}
