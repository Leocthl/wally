// Deterministic decision ids: a readable cart prefix plus a digest of (cart id, cart fingerprint, time, resolves,
// phase, outcome). The outcome and the fingerprint joined the digest after the audit (LOW): before, an APPROVE and a
// DENY made at one instant on one cart id, or on two carts that shared an id, got the same id. The judge record is
// left out on purpose: its latency and provider vary between a live run and its replay, the verdict does not.
import type { Cart, Decision } from "../generated";
import { canonicalJson, cartFingerprint, sha256Hex } from "./hash";

/** mandate.schema.json $defs.DecisionId. */
const DECISION_ID = /^dec_[A-Za-z0-9]{6,40}$/;
/** Id layout (format choice within the DecisionId pattern, not a policy number). */
const CART_PREFIX_CHARS = 12;
const DIGEST_CHARS = 16;

export type DecisionPhase = "decide" | "checkout";

export const isDecisionId = (value: unknown): value is string => typeof value === "string" && DECISION_ID.test(value);

/** The cart as JSON writes it (NaN to null, bigint to text), so the fingerprint is total even for a hostile cart. */
function jsonCart(cart: Cart): Cart {
  const text = JSON.stringify(cart, (_key, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
  return (text === undefined ? {} : JSON.parse(text)) as Cart;
}

export interface DecisionIdParts {
  readonly cart: Cart;
  readonly decidedAt: string;
  readonly resolves: string | undefined;
  readonly phase: DecisionPhase;
  readonly outcome: Decision["outcome"];
}

export function decisionId({ cart, decidedAt, resolves, phase, outcome }: DecisionIdParts): string {
  const key = { cart_id: cart.id, cart_sha256: cartFingerprint(jsonCart(cart)), decided_at: decidedAt, resolves: resolves ?? null, phase, outcome };
  const digest = sha256Hex(canonicalJson(key));
  const prefix = String(cart.id).replace(/^crt_/, "").replace(/[^A-Za-z0-9]/g, "").slice(0, CART_PREFIX_CHARS);
  return `dec_${prefix}${digest.slice(0, DIGEST_CHARS)}`;
}
