// Executor contract: dependencies in, typed outcomes out. The executor never decides (the engine does), it
// reports. Outcomes expose last4 only (never the handle, never any card detail beyond the masked digits, I8).
import type { CardRecord, Decision } from "../generated";
import type { AppendEntry, CardEvent, Clock, LogStore, MerchantPort, MerchantQuote, RailPort, Signer } from "../ports";

export interface ExecutorDeps {
  readonly merchant: MerchantPort;
  readonly rail: RailPort;
  readonly store: LogStore;
  readonly signer: Signer;
  readonly appendEntry: AppendEntry;
  readonly clock: Clock;
  /** merchant.checkout calls per attempt, first call included. Default EXECUTOR_DEFAULTS.maxCheckoutCalls. */
  readonly maxCheckoutCalls?: number;
}

export interface CheckoutInput {
  readonly logId: string;
  /** The APPROVE this checkout pays (I1), exactly as logged in `logId`. Its cart is what the merchant is re-quoted against (R12). */
  readonly decision: Decision;
  /** The card minted for that decision, exactly as logged (CARD_MINTED). Only its handle goes to the merchant. */
  readonly card: CardRecord;
  /**
   * Stable key for this attempt. Default chk:<card id>:<n>, n = 1 + the logged attempts that used such a key for
   * this card, so a re-run after a lost response (nothing logged) reuses the key and the rail never charges twice.
   * A key that is already in the log replays the logged outcome (attempts 0) with no merchant call and no new entry.
   */
  readonly idempotencyKey?: string;
}

/**
 * Facts worth a second look. The event is logged regardless; the orchestrator decides what follows.
 * MERCHANT_REPORT_MISMATCH: the merchant's copy of the event differs from the rail's own record; the rail's is logged.
 */
export type ExecutorAnomaly = "AMOUNT_ABOVE_APPROVED" | "MERCHANT_DOMAIN_MISMATCH" | "MERCHANT_REPORT_MISMATCH";

/**
 * Why nothing was presented, or nothing logged. The log-standing reasons (audit H3) refuse before any merchant call:
 * MANDATE_REVOKED, PACKET_EXPIRED (logged or past validUntil), APPROVAL_NOT_LOGGED (the APPROVE is not in this log as
 * given), APPROVAL_RESOLVED (a later decision closed it), CARD_NOT_LOGGED (no matching CARD_MINTED), LOG_INVALID (the
 * fold refuses the log). RAIL_MISMATCH: the rail does not confirm the merchant's answer for the key (H5).
 */
export type ExecutorErrorReason =
  | "INVALID_INPUT"
  | "LOG_UNAVAILABLE"
  | "LOG_INVALID"
  | "MANDATE_REVOKED"
  | "PACKET_EXPIRED"
  | "APPROVAL_NOT_LOGGED"
  | "APPROVAL_RESOLVED"
  | "CARD_NOT_LOGGED"
  | "QUOTE_FAILED"
  | "QUOTE_INVALID"
  | "CHECKOUT_FAILED"
  | "EVENT_INVALID"
  | "RAIL_MISMATCH"
  | "RAIL_REJECTED"
  | "LOG_APPEND_FAILED";

/** The rail answered and the answer is in the log: AUTHORISED (card now USED) or DECLINED (limit held). */
export interface CheckoutSettled {
  readonly status: "AUTHORISED" | "DECLINED";
  readonly simulated: true;
  readonly event: CardEvent;
  readonly last4: string;
  /** merchant.checkout calls used (1 means no retry was needed). */
  readonly attempts: number;
  readonly idempotency_key: string;
  /** Seq of the CARD_EVENT log entry. */
  readonly log_seq: number;
  readonly anomalies: readonly ExecutorAnomaly[];
}

/**
 * The re-quote differs from the approved cart in any price field (total, subtotal, shipping, fees, FX), not only the
 * total. Nothing was charged and nothing was logged. R12 is the engine's call (same comparison, rules/drift.ts).
 */
export interface CheckoutDrift {
  readonly status: "DRIFT";
  readonly simulated: true;
  readonly last4: string;
  readonly approved_total_minor: number;
  readonly quoted_total_minor: number;
  /** quoted minus approved; negative when the price fell, 0 when only the split moved. */
  readonly delta_minor: number;
  /** Price fields that differ from the approved cart. */
  readonly changed: readonly string[];
  readonly quote: MerchantQuote;
}

/** Every call timed out. Whether the charge landed is unknown; re-run with this key to find out. Nothing was logged. */
export interface CheckoutTimeout {
  readonly status: "TIMEOUT";
  readonly simulated: true;
  readonly last4: string;
  readonly attempts: number;
  readonly idempotency_key: string;
}

export interface ExecutorError {
  readonly status: "ERROR";
  readonly simulated: true;
  readonly reason: ExecutorErrorReason;
  readonly message: string;
  readonly last4?: string;
  readonly idempotency_key?: string;
  /** Set when the rail did answer but the answer could not be logged (LOG_APPEND_FAILED). */
  readonly event?: CardEvent;
}

export type CheckoutOutcome = CheckoutSettled | CheckoutDrift | CheckoutTimeout | ExecutorError;

export interface VoidInput {
  readonly logId: string;
  readonly cardId: string;
}

export interface VoidSettled {
  readonly status: "VOIDED";
  readonly simulated: true;
  readonly event: CardEvent;
  readonly log_seq: number;
}

export type VoidOutcome = VoidSettled | ExecutorError;

export interface ExpireInput {
  readonly logId: string;
}

export interface ExpireSettled {
  readonly status: "EXPIRED";
  readonly simulated: true;
  readonly events: readonly CardEvent[];
  readonly log_seqs: readonly number[];
}

export interface ExpireError {
  readonly status: "ERROR";
  readonly simulated: true;
  readonly reason: ExecutorErrorReason;
  readonly message: string;
  /** Events the rail produced that are not in the log yet; append them or the packet never releases the limit. */
  readonly unlogged: readonly CardEvent[];
}

export type ExpireOutcome = ExpireSettled | ExpireError;

export interface Executor {
  /**
   * Refuse unless the log still stands behind the payment (not revoked or expired, the APPROVE and the card logged, the
   * approval not resolved), re-quote (R12), charge through the merchant with a stable key, log the rail's own CARD_EVENT
   * for that key, return a typed outcome. Never throws.
   */
  checkout(input: CheckoutInput): Promise<CheckoutOutcome>;
  /** rail.void for an ACTIVE card, then log CARD_EVENT(VOIDED). Never throws. */
  voidCard(input: VoidInput): Promise<VoidOutcome>;
  /** rail.expireDue(now), then log each CARD_EVENT(EXPIRED). Never throws. */
  expireDue(input: ExpireInput): Promise<ExpireOutcome>;
}
