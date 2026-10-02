// Pure checks for RailPort.mint (F1 semantics, I1, I2, I6 backstop). Each throws MintError and nothing else,
// so a caller can tell exactly which rule stopped the mint. Nothing here touches rail state.
import type { Decision } from "@laisee/core/generated";
import { MintError } from "@laisee/core/ports";
import { formatIssues, validateDecision } from "@laisee/core/schema";
import { addMonthsUtc } from "./time";

export interface MintLimits {
  readonly ceilingMinor: number;
  readonly maxActive: number;
  readonly maxTtlMs: number;
  readonly validityMonths: number;
}

export interface Approval {
  readonly decision: Decision;
  readonly limitMinor: number;
}

/**
 * I1 and I2: only a schema-valid APPROVE with a limit equal to the cart total, inside the packet's remaining
 * budget, from a packet that was ACTIVE when decided. Anything else is NOT_APPROVED (fail closed, I5).
 */
export function approvedLimit(candidate: unknown): Approval {
  const checked = validateDecision(candidate);
  if (!checked.ok) throw new MintError("NOT_APPROVED", `decision is not schema-valid: ${formatIssues(checked.errors)}`);
  const decision = checked.value;
  const limit = decision.approved_limit_minor;
  if (decision.outcome !== "APPROVE" || limit === undefined) throw new MintError("NOT_APPROVED", `decision outcome is ${decision.outcome}`);
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new MintError("NOT_APPROVED", "approved limit must be a positive integer");
  if (limit !== decision.cart.total_minor) throw new MintError("NOT_APPROVED", "approved limit differs from the cart total (I2)");
  if (decision.mandate_id !== decision.cart.mandate_id || decision.mandate_id !== decision.packet.mandate_id) {
    throw new MintError("NOT_APPROVED", "decision, cart and packet name different mandates");
  }
  if (decision.packet.status !== "ACTIVE") throw new MintError("NOT_APPROVED", `packet was ${decision.packet.status} when decided (I6)`);
  if (limit > decision.packet.remaining_minor) throw new MintError("NOT_APPROVED", "approved limit is above the packet remaining (I2)");
  return { decision, limitMinor: limit };
}

export function assertCeiling(limitMinor: number, limits: MintLimits): void {
  if (limitMinor > limits.ceilingMinor) throw new MintError("OVER_CEILING", `limit ${limitMinor} is above the rail ceiling ${limits.ceilingMinor} [F1]`);
}

/**
 * TTL = min(card TTL [F30], packet expiry, validity [F1]). The request may not ask for more than the card TTL
 * or the validity limit (TTL_TOO_LONG); the card's expiry is then clamped to the packet expiry, and a packet
 * that has already expired leaves no window at all (TTL_TOO_LONG).
 */
export function cardExpiry(decision: Decision, ttlMs: number, now: Date, limits: MintLimits): Date {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new MintError("TTL_TOO_LONG", "ttlMs must be a positive integer");
  const validityMs = addMonthsUtc(now, limits.validityMonths).getTime() - now.getTime();
  const allowedMs = Math.min(limits.maxTtlMs, validityMs);
  if (ttlMs > allowedMs) throw new MintError("TTL_TOO_LONG", `ttlMs ${ttlMs} is above the allowed ${allowedMs} (F30, F1 validity)`);
  const packetExpiryMs = Date.parse(decision.packet.expires_at);
  if (!(packetExpiryMs > now.getTime())) throw new MintError("TTL_TOO_LONG", "the packet has expired; no valid window remains");
  return new Date(Math.min(now.getTime() + ttlMs, packetExpiryMs));
}

export function assertSlotFree(activeCards: number, limits: MintLimits): void {
  if (activeCards >= limits.maxActive) throw new MintError("MAX_ACTIVE", `${activeCards} cards already ACTIVE; the rail allows ${limits.maxActive} [F1]`);
}
