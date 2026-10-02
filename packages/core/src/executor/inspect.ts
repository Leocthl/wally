// Checks on what the merchant and rail hand back, before anything is logged.
import type { CardRecord, Cart, Decision } from "../generated";
import type { CardEvent } from "../ports";
import { cartTotals } from "../rules";
import { formatIssues, validateCardEvent, validateCardRecord, validateDecision } from "../schema";
import { LOG_ID_PATTERN } from "./config";
import type { ExecutorAnomaly } from "./types";

/** Why the input cannot be paid, or null. Defence in depth for I1 and I2: the executor never presents a card it cannot tie to an APPROVE. */
export function inputProblem(logId: string, decision: Decision, card: CardRecord): string | null {
  if (!LOG_ID_PATTERN.test(logId)) return "logId is not a log id";
  const decisionCheck = validateDecision(decision);
  if (!decisionCheck.ok) return `decision is not schema-valid: ${formatIssues(decisionCheck.errors)}`;
  const cardCheck = validateCardRecord(card);
  if (!cardCheck.ok) return `card is not schema-valid: ${formatIssues(cardCheck.errors)}`;
  const approved = decision.approved_limit_minor;
  if (decision.outcome !== "APPROVE" || approved === undefined) return "decision is not an APPROVE (I1)";
  if (approved <= 0) return "approved limit is zero";
  if (approved !== decision.cart.total_minor) return "approved limit differs from the cart total (I2)";
  if (!cartTotals(decision.cart).consistent) return "the approved cart does not add up (lines, shipping, fees, FX)";
  if (card.decision_id !== decision.id) return "card was not minted for this decision (I1)";
  if (card.mandate_id !== decision.mandate_id) return "card belongs to another mandate";
  if (card.limit_minor !== approved) return "card limit differs from the approved limit (I2)";
  return null;
}

const QUOTE_FIELDS = ["total_minor", "subtotal_minor", "shipping_minor", "fees_minor", "fx_minor"] as const;

/** A quote is usable when every amount is a non-negative safe integer (money is integer minor units). */
export function quoteProblem(quote: unknown): string | null {
  if (typeof quote !== "object" || quote === null) return "quote is not an object";
  const fields = quote as Record<string, unknown>;
  const bad = QUOTE_FIELDS.filter((f) => typeof fields[f] !== "number" || !Number.isSafeInteger(fields[f]) || (fields[f] as number) < 0);
  return bad.length === 0 ? null : `quote fields are not non-negative integers: ${bad.join(", ")}`;
}

export interface EventContext {
  readonly cardId: string;
  readonly idempotencyKey: string;
  readonly approvedTotalMinor: number;
  readonly cart: Cart;
}

/** Why a checkout answer cannot be logged for this card, or null. */
export function eventProblem(event: CardEvent, ctx: EventContext): string | null {
  const check = validateCardEvent(event);
  if (!check.ok) return `event is not schema-valid: ${formatIssues(check.errors)}`;
  if (event.event !== "AUTHORISED" && event.event !== "DECLINED") return `checkout cannot produce a ${event.event} event`;
  const foreignOk = event.event === "DECLINED" && event.decline_code === "UNKNOWN_HANDLE";
  if (event.card_id !== ctx.cardId && !foreignOk) return "event belongs to another card";
  if (event.idempotency_key !== ctx.idempotencyKey) return "event does not carry this attempt's idempotency key";
  return null;
}

/** Things the orchestrator may want to flag. The executor reports them and decides nothing. */
export function anomaliesOf(event: CardEvent, ctx: EventContext): readonly ExecutorAnomaly[] {
  if (event.event !== "AUTHORISED") return [];
  const found: ExecutorAnomaly[] = [];
  if ((event.amount_minor ?? 0) > ctx.approvedTotalMinor) found.push("AMOUNT_ABOVE_APPROVED");
  if (event.merchant_domain !== ctx.cart.merchant.domain) found.push("MERCHANT_DOMAIN_MISMATCH");
  return found;
}
