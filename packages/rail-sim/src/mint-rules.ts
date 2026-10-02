// Pure checks for RailPort.mint (F1 semantics, I1, I2, I6 backstop). Each throws MintError and nothing else,
// so a caller can tell exactly which rule stopped the mint. Nothing here touches rail state.
import type { Decision } from "@laisee/core/generated";
import { MintError } from "@laisee/core/ports";
import { formatIssues, validateDecision } from "@laisee/core/schema";
import { addMonthsUtc } from "./time";

/** Every message the SIMULATED rail produces says so (rail outputs carry the label). */
function refuse(code: MintError["code"], why: string): MintError {
  return new MintError(code, `SIMULATED rail: ${why}`);
}

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
 * I1: only a schema-valid APPROVE with a positive integer limit and no failing rule can mint (an APPROVE that still
 * carries a FAIL was relabelled, audit S-RAIL-4). Anything else is NOT_APPROVED (fail closed, I5).
 */
export function approvedLimit(candidate: unknown): Approval {
  const checked = validateDecision(candidate);
  if (!checked.ok) throw refuse("NOT_APPROVED", `decision is not schema-valid: ${formatIssues(checked.errors)}`);
  const decision = checked.value;
  const limit = decision.approved_limit_minor;
  if (decision.outcome !== "APPROVE" || limit === undefined) throw refuse("NOT_APPROVED", `decision outcome is ${decision.outcome}`);
  if (!Number.isSafeInteger(limit) || limit <= 0) throw refuse("NOT_APPROVED", "approved limit must be a positive integer");
  const failing = decision.rules.filter((r) => r.result !== "PASS" && r.result !== "SKIPPED").map((r) => r.id);
  if (failing.length > 0) throw refuse("NOT_APPROVED", `the APPROVE still carries failing rules (${failing.join(", ")})`);
  return { decision, limitMinor: limit };
}

/** I2 on its own: limit == approved_limit_minor == cart total. Run for repeats too, where the ceiling cannot apply. */
export function assertLimitIsTotal({ decision, limitMinor }: Approval): void {
  if (limitMinor !== decision.cart.total_minor) throw refuse("NOT_APPROVED", "approved limit differs from the cart total (I2)");
}

/**
 * I2 and I6 backstops, for an engine that went wrong: the limit is the cart total, inside the packet's remaining
 * budget, and the packet was ACTIVE when decided. Runs after the ceiling check so OVER_CEILING names the rail rule.
 */
export function assertApprovalConsistent({ decision, limitMinor }: Approval): void {
  assertLimitIsTotal({ decision, limitMinor });
  if (decision.mandate_id !== decision.cart.mandate_id || decision.mandate_id !== decision.packet.mandate_id) {
    throw refuse("NOT_APPROVED", "decision, cart and packet name different mandates");
  }
  if (decision.packet.status !== "ACTIVE") throw refuse("NOT_APPROVED", `packet was ${decision.packet.status} when decided (I6)`);
  if (limitMinor > decision.packet.remaining_minor) throw refuse("NOT_APPROVED", "approved limit is above the packet remaining (I2)");
}

export function assertCeiling(limitMinor: number, limits: MintLimits): void {
  if (limitMinor > limits.ceilingMinor) throw refuse("OVER_CEILING", `limit ${limitMinor} is above the rail ceiling ${limits.ceilingMinor} [F1]`);
}

/**
 * TTL = min(card TTL [F30], packet expiry, validity [F1]). The request may not ask for more than the card TTL
 * or the validity limit (TTL_TOO_LONG); the card's expiry is then clamped to the packet expiry, and a packet
 * that has already expired leaves no window at all (TTL_TOO_LONG). Expiry is judged at `atMs`, the rail's own
 * monotonic time, never earlier than the request's `now`: a stale `now` cannot revive an expired packet.
 */
export function cardExpiry(decision: Decision, ttlMs: number, now: Date, atMs: number, limits: MintLimits): Date {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw refuse("TTL_TOO_LONG", "ttlMs must be a positive integer");
  const validityMs = addMonthsUtc(now, limits.validityMonths).getTime() - now.getTime();
  const allowedMs = Math.min(limits.maxTtlMs, validityMs);
  if (ttlMs > allowedMs) throw refuse("TTL_TOO_LONG", `ttlMs ${ttlMs} is above the allowed ${allowedMs} (F30, F1 validity)`);
  const packetExpiryMs = Date.parse(decision.packet.expires_at);
  if (!(packetExpiryMs > atMs)) throw refuse("TTL_TOO_LONG", "the packet has expired; no valid window remains");
  const expiryMs = Math.min(now.getTime() + ttlMs, packetExpiryMs);
  if (!(expiryMs > atMs)) throw refuse("TTL_TOO_LONG", "the request time is so stale that the card would be born expired");
  return new Date(expiryMs);
}

export function assertSlotFree(activeCards: number, limits: MintLimits): void {
  if (activeCards >= limits.maxActive) throw refuse("MAX_ACTIVE", `${activeCards} cards already ACTIVE; the rail allows ${limits.maxActive} [F1]`);
}
