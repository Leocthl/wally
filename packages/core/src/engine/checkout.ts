// Checkout phase (R12): the executor re-quotes before presenting the card. Equal prices => no decision
// (the approval stands). A moved price, a revoked or expired mandate, or an unverified proof => a DENY
// that resolves the APPROVE, so the orchestrator voids the card; a new cart needs a new decision.
// Only R1, R2 and R12 are evaluated here; R3-R11 were evaluated at approval and are SKIPPED.
import type { Decision, Mandate, PacketState, RuleId } from "../generated";
import type { DecideContext, MerchantQuote } from "../ports";
import { evaluateR1, evaluateR2, evaluateR12, skipped, timeOf } from "../rules";
import { assembleDecision } from "./assemble";

export interface CheckoutInput {
  readonly mandate: Mandate;
  /** Current packet (folded now), so a revoke or expiry after approval is seen. */
  readonly packet: PacketState;
  /** The APPROVE decision behind the card. */
  readonly approved: Decision;
  /** MerchantPort.quote at checkout. */
  readonly quote: MerchantQuote;
  readonly now: Date;
  readonly ctx?: DecideContext;
}

const SKIPPED_AT_CHECKOUT: readonly RuleId[] = ["R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11"];

export function checkoutDecision(meta: Decision["engine"], input: CheckoutInput): Decision | null {
  const { mandate, packet, approved, quote, now } = input;
  if (approved.outcome !== "APPROVE") throw new TypeError(`decideCheckout needs an APPROVE decision, got ${approved.outcome}`);
  const cart = approved.cart;
  const r1 = evaluateR1({ mandate, packet, cart, proofValid: input.ctx?.mandateProofValid });
  const r2 = evaluateR2({ mandate, packet, now });
  const r12 = evaluateR12({ approved: cart, quote });
  if (r1.result === "PASS" && r2.result === "PASS" && r12.result === "PASS") return null;
  const nowMs = timeOf(now);
  const rules = [r1, r2, ...SKIPPED_AT_CHECKOUT.map((id) => skipped(id, { phase: "checkout" })), r12];
  return assembleDecision({
    phase: "checkout",
    mandate,
    packet,
    cart,
    judge: approved.judge, // R12 decisions copy the judge record of the decision they resolve
    decidedAt: nowMs === null ? approved.decided_at : new Date(nowMs).toISOString(),
    rules,
    resolves: approved.id,
    engine: meta,
  });
}
