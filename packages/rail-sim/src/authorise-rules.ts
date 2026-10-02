// Pure authorise semantics for the single-use card [F1]: which decline applies, and the events that result.
// Precedence: used, voided, expired, merchant mismatch, over limit. A dead card says so before anything else.
import type { CardRecord } from "@laisee/core/generated";
import type { AuthoriseRequest, CardEvent } from "@laisee/core/ports";
import type { DeclineCode } from "./decline-table";

/** The decline for this request on this card, or null when the charge is authorised. */
export function evaluateAuthorise(card: CardRecord, req: AuthoriseRequest): DeclineCode | null {
  if (card.state === "USED") return "CARD_USED";
  if (card.state === "VOIDED") return "CARD_VOIDED";
  if (card.state === "EXPIRED" || Date.parse(card.expires_at) <= req.now.getTime()) return "CARD_EXPIRED";
  if (card.merchant_lock !== undefined && card.merchant_lock !== req.merchantDomain) return "MERCHANT_MISMATCH";
  if (req.amountMinor > card.limit_minor) return "OVER_LIMIT";
  return null;
}

export function authorisedEvent(card: CardRecord, req: AuthoriseRequest): CardEvent {
  return Object.freeze({
    card_id: card.id,
    event: "AUTHORISED",
    at: req.now.toISOString(),
    amount_minor: req.amountMinor,
    merchant_domain: req.merchantDomain,
    idempotency_key: req.idempotencyKey,
    simulated: true,
  });
}

export function declinedEvent(cardId: string, req: AuthoriseRequest, code: DeclineCode): CardEvent {
  return Object.freeze({
    card_id: cardId,
    event: "DECLINED",
    at: req.now.toISOString(),
    amount_minor: req.amountMinor,
    merchant_domain: req.merchantDomain,
    decline_code: code,
    idempotency_key: req.idempotencyKey,
    simulated: true,
  });
}

export function lifecycleEvent(cardId: string, event: "VOIDED" | "EXPIRED", at: Date): CardEvent {
  return Object.freeze({ card_id: cardId, event, at: at.toISOString(), simulated: true });
}

/** Everything that identifies one charge attempt, apart from the clock. Same key plus same print is a retry. */
export function requestPrint(req: AuthoriseRequest): string {
  return JSON.stringify([req.handle, req.amountMinor, req.merchantDomain]);
}
