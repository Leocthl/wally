// Delegator-signed payloads (docs/02 section 11): revocation 'laisee.revoke.v1' (MANDATE_REVOKED) and
// escalation answer 'laisee.resolve.v2' (DECISION.escalation.answer). Signature over UTF-8 of
// '<domain>:' + hex SHA-256(JCS(object without signature)), base64url without padding. Browser-safe.
// An answer v2 binds the escalated decision, its mandate and its cart (cart_sha256), so one consent cannot be
// spent on another cart or packet. There is no v1 code path: a v1 answer fails the schema (fail closed).
import { fromBase64url, toBase64url, utf8 } from "../crypto/bytes";
import { parseDidKey } from "../crypto/did-key";
import { verifyEd25519 } from "../crypto/ed25519";
import { clipMessage, errorMessage } from "../crypto/errors";
import { jcsSha256Hex } from "../crypto/jcs";
import type { Cart, EscalationAnswer, Revocation } from "../generated";
import type { Signer } from "../ports";
import { formatIssues, validateEscalationAnswer, validateRevocation, type Validator } from "../schema";
import { cartSha256 } from "./cart-sha256";

export const REVOKE_DOMAIN = "laisee.revoke.v1";
export const RESOLVE_DOMAIN = "laisee.resolve.v2";
export type DelegatorDomain = typeof REVOKE_DOMAIN | typeof RESOLVE_DOMAIN;

export type DelegatorFailure = "SCHEMA" | "SIGNER" | "SIGNATURE" | "BINDING";
/** Schema issues and characters kept in a failure detail (display limits, not policy). */
const MAX_ISSUES = 3;
const MAX_DETAIL_CHARS = 400;
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
  if (!parsed.ok) return { valid: false, reason: "SCHEMA", detail: clipMessage(formatIssues(parsed.errors.slice(0, MAX_ISSUES)), MAX_DETAIL_CHARS) };
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

/** What an answer is bound to: the ESCALATE decision, its mandate and the cart shown to the delegator. */
export interface AnswerBinding {
  /** The ESCALATE decision being answered (decision.id). */
  readonly decision_id: string;
  /** Its mandate (decision.mandate_id). */
  readonly mandate_id: string;
  /** The escalated cart (decision.cart); cart_sha256 is computed from it, never taken on trust. */
  readonly cart: Cart;
}

export interface EscalationAnswerInput extends AnswerBinding {
  readonly choice: EscalationAnswer["choice"];
  readonly answered_at: Date;
}

export function signEscalationAnswer(input: EscalationAnswerInput, signer: Signer): EscalationAnswer {
  const unsigned = {
    decision_id: input.decision_id,
    mandate_id: input.mandate_id,
    cart_sha256: cartSha256(input.cart),
    choice: input.choice,
    answered_at: input.answered_at.toISOString(),
    signer: signer.did,
  };
  return signPayload<EscalationAnswer>(RESOLVE_DOMAIN, unsigned, signer, validateEscalationAnswer);
}

const unbound = (detail: string): DelegatorCheck => ({ valid: false, reason: "BINDING", detail });

function bindingProblem(answer: EscalationAnswer, expected: AnswerBinding): string | null {
  if (answer.decision_id !== expected.decision_id) return `answer is for ${answer.decision_id}, not ${expected.decision_id}`;
  if (answer.mandate_id !== expected.mandate_id) return `answer is for mandate ${answer.mandate_id}, not ${expected.mandate_id}`;
  let expectedCart: string;
  try {
    expectedCart = cartSha256(expected.cart);
  } catch (err) {
    return `the escalated cart has no fingerprint: ${errorMessage(err)}`;
  }
  return answer.cart_sha256 === expectedCart ? null : "answer approves or denies a different cart than the one escalated";
}

const isBinding = (value: unknown): value is AnswerBinding =>
  value !== null &&
  typeof value === "object" &&
  typeof (value as AnswerBinding).decision_id === "string" &&
  typeof (value as AnswerBinding).mandate_id === "string" &&
  typeof (value as AnswerBinding).cart === "object" &&
  (value as AnswerBinding).cart !== null;

/**
 * A valid answer is schema-valid, signed by the pinned delegator under laisee.resolve.v2, and bound to the
 * expected decision, mandate and cart. The binding is mandatory; without it the check fails closed (BINDING).
 */
export function verifyEscalationAnswer(input: unknown, delegatorDid: string, expected: AnswerBinding): DelegatorCheck {
  if (!isBinding(expected)) return unbound("no escalated decision, mandate and cart to bind the answer to");
  const check = verifyPayload<EscalationAnswer>(RESOLVE_DOMAIN, input, delegatorDid, validateEscalationAnswer);
  if (!check.valid) return check;
  const problem = bindingProblem(input as EscalationAnswer, expected);
  return problem === null ? check : unbound(problem);
}
