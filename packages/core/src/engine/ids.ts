// Deterministic decision ids: a readable cart prefix plus a digest of (cart id, time, resolves, phase),
// so a resolving or checkout decision at the same instant never reuses the earlier id.
import { canonicalJson, sha256Hex } from "./hash";

/** mandate.schema.json $defs.DecisionId. */
const DECISION_ID = /^dec_[A-Za-z0-9]{6,40}$/;
/** Id layout (format choice within the DecisionId pattern, not a policy number). */
const CART_PREFIX_CHARS = 12;
const DIGEST_CHARS = 16;

export type DecisionPhase = "decide" | "checkout";

export const isDecisionId = (value: unknown): value is string => typeof value === "string" && DECISION_ID.test(value);

export function decisionId(cartId: string, decidedAt: string, resolves: string | undefined, phase: DecisionPhase): string {
  const digest = sha256Hex(canonicalJson({ cart_id: cartId, decided_at: decidedAt, resolves: resolves ?? null, phase }));
  const prefix = cartId.replace(/^crt_/, "").replace(/[^A-Za-z0-9]/g, "").slice(0, CART_PREFIX_CHARS);
  return `dec_${prefix}${digest.slice(0, DIGEST_CHARS)}`;
}
