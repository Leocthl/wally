// verifyChain step 9 (docs/02 section 11): consent and money must add up against the delegator-signed
// credential, so an operator who holds the engine key cannot log a mint, a charge or a consent that the sealed
// terms forbid. Pure, browser-safe, one entry at a time after steps 1-7, using only what the engine and rail
// already log. It cannot see what was never logged (stated limit). Reasons:
//   NO_DECISION   a card with no earlier APPROVE for it in this log (I1), or a charge on a card never minted
//   DUPLICATE     one decision id or card id with two different contents, a second card for one decision, an
//                 escalation approved after it was already resolved (one consent buys one decision).
//                 A byte-identical repeat of an entry changes nothing and is accepted, as the fold does.
//   CONSENT       an APPROVE above the mandate's ask-above, or one that resolves an escalation, without the
//                 delegator's in-time APPROVE answer for that same cart
//   OVERSPEND     approved limit != cart total or card limit != approved limit (I2); over the per-purchase cap
//                 or share of remaining (R4); a charge over the card limit or on a used, voided or expired card;
//                 committed + spent over the sealed budget
//   AFTER_REVOKE  an APPROVE or a mint dated outside the mandate's validity (R2), or a mint logged after
//                 MANDATE_REVOKED or PACKET_EXPIRED (I6)
import type { CardRecord, Decision, LogEntry } from "../generated";
import { cartSha256 } from "../log/cart-sha256";
import type { CardEvent, VerifyFailure } from "../ports";
import { capProblem, outsideValidity, type SealedTerms } from "./terms";

type CardState = "ACTIVE" | "USED" | "VOIDED" | "EXPIRED";

interface Escalated {
  readonly cartSha256: string;
  readonly expiresAt: string;
}

interface DecisionFact {
  readonly seq: number;
  readonly payloadHash: string;
  readonly outcome: Decision["outcome"];
  readonly approvedLimit: number | null;
  /** ESCALATE decisions only. */
  readonly escalation: Escalated | null;
}

interface CardFact {
  readonly payloadHash: string;
  readonly limit: number;
  readonly state: CardState;
}

export interface Semantics {
  readonly terms: SealedTerms;
  readonly decisions: ReadonlyMap<string, DecisionFact>;
  /** decision id -> the card minted for it. */
  readonly mints: ReadonlyMap<string, string>;
  readonly cards: ReadonlyMap<string, CardFact>;
  /** ESCALATE ids some later decision resolved (answered, expired). */
  readonly resolved: ReadonlySet<string>;
  readonly committed: number;
  readonly spent: number;
  /** Which entry closed the packet ("MANDATE_REVOKED at seq 8"), or null while it is open. */
  readonly closed: string | null;
}

export type SemanticStep =
  | { readonly ok: true; readonly state: Semantics }
  | { readonly ok: false; readonly reason: VerifyFailure; readonly detail: string };

const ok = (state: Semantics): SemanticStep => ({ ok: true, state });
const no = (reason: VerifyFailure, detail: string): SemanticStep => ({ ok: false, reason, detail });

export function initialSemantics(terms: SealedTerms): Semantics {
  return { terms, decisions: new Map(), mints: new Map(), cards: new Map(), resolved: new Set(), committed: 0, spent: 0, closed: null };
}

/** The cart fingerprint, or null when it cannot be computed (then nothing can match it: fail closed). */
function fingerprint(cart: Decision["cart"]): string | null {
  try {
    return cartSha256(cart);
  } catch {
    return null; // a cart with no canonical form binds nothing
  }
}

function escalationOf(decision: Decision): Escalated | null {
  if (decision.outcome !== "ESCALATE" || decision.escalation === undefined) return null;
  return { cartSha256: fingerprint(decision.cart) ?? "", expiresAt: decision.escalation.expires_at };
}

/** (b) An APPROVE that resolves an escalation needs the delegator's in-time APPROVE answer for the same cart. */
function consentProblem(decision: Decision, state: Semantics): SemanticStep | null {
  const target = decision.resolves === undefined ? undefined : state.decisions.get(decision.resolves);
  const escalated = target?.escalation ?? null;
  const name = `APPROVE ${decision.id}`;
  if (escalated === null) return no("CONSENT", `${name} resolves ${String(decision.resolves)}, which is not an earlier escalation in this log`);
  if (state.resolved.has(decision.resolves ?? "")) {
    return no("DUPLICATE", `${name} resolves escalation ${String(decision.resolves)}, which was already resolved: one consent buys one decision`);
  }
  const answer = decision.escalation?.answer;
  if (answer === undefined) return no("CONSENT", `${name} resolves an escalation without any delegator answer`);
  if (answer.choice !== "APPROVE") return no("CONSENT", `${name} rests on the delegator's ${answer.choice} answer`);
  const cart = fingerprint(decision.cart);
  if (cart === null || cart !== escalated.cartSha256 || answer.cart_sha256 !== escalated.cartSha256) {
    return no("CONSENT", `${name} is for a different cart than the one the delegator was asked about`);
  }
  if (!(Date.parse(answer.answered_at) < Date.parse(escalated.expiresAt))) {
    return no("CONSENT", `${name} rests on an answer given after the escalation window closed`);
  }
  return null;
}

/** I2, R2 and R4 for an APPROVE, then consent: by an answered escalation, or not needed below ask-above. */
function approveProblem(decision: Decision, state: Semantics): SemanticStep | null {
  const name = `APPROVE ${decision.id}`;
  const total = decision.cart.total_minor;
  if (decision.approved_limit_minor !== total) {
    return no("OVERSPEND", `${name} sets limit ${String(decision.approved_limit_minor)} but the cart total is ${total} (I2)`);
  }
  const outside = outsideValidity(decision.decided_at, state.terms);
  if (outside !== null) return no("AFTER_REVOKE", `${name} was decided at ${outside} (R2)`);
  const cap = capProblem(total, state.terms.budgetMinor - state.committed - state.spent, state.terms);
  if (cap !== null) return no("OVERSPEND", `${name}: ${cap} (R4)`);
  if (decision.resolves !== undefined) return consentProblem(decision, state);
  const ask = state.terms.askAboveMinor;
  return ask !== null && total > ask ? no("CONSENT", `${name} of ${total} is above the ask-above ${ask} without the delegator's answer (R4)`) : null;
}

function onDecision(decision: Decision, seq: number, payloadHash: string, state: Semantics): SemanticStep {
  const earlier = state.decisions.get(decision.id);
  if (earlier !== undefined) {
    return earlier.payloadHash === payloadHash ? ok(state) : no("DUPLICATE", `decision id ${decision.id} is used twice (first at seq ${earlier.seq})`);
  }
  const problem = decision.outcome === "APPROVE" ? approveProblem(decision, state) : null;
  if (problem !== null) return problem;
  const target = decision.resolves === undefined ? undefined : state.decisions.get(decision.resolves);
  const resolved = target?.escalation ? new Set([...state.resolved, decision.resolves ?? ""]) : state.resolved;
  const approvedLimit = decision.outcome === "APPROVE" ? (decision.approved_limit_minor ?? null) : null;
  const fact: DecisionFact = { seq, payloadHash, outcome: decision.outcome, approvedLimit, escalation: escalationOf(decision) };
  return ok({ ...state, resolved, decisions: new Map([...state.decisions, [decision.id, fact]]) });
}

/** (a) One card per logged APPROVE, at its approved limit, while the packet is open and valid, within budget. */
function onMinted(card: CardRecord, payloadHash: string, state: Semantics): SemanticStep {
  const existing = state.cards.get(card.id);
  if (existing !== undefined) return existing.payloadHash === payloadHash ? ok(state) : no("DUPLICATE", `card id ${card.id} is minted twice`);
  const decision = state.decisions.get(card.decision_id);
  if (decision === undefined) return no("NO_DECISION", `card ${card.id} names ${card.decision_id}, which is not an earlier decision in this log (I1)`);
  if (decision.outcome !== "APPROVE") return no("NO_DECISION", `card ${card.id} was minted for ${card.decision_id}, a ${decision.outcome} (I1)`);
  if (state.closed !== null) return no("AFTER_REVOKE", `card ${card.id} was minted after ${state.closed} (I6)`);
  const outside = outsideValidity(card.minted_at, state.terms);
  if (outside !== null) return no("AFTER_REVOKE", `card ${card.id} was minted at ${outside} (I6)`);
  const prior = state.mints.get(card.decision_id);
  if (prior !== undefined) return no("DUPLICATE", `${card.decision_id} already minted card ${prior}: one APPROVE mints one card`);
  if (card.limit_minor !== decision.approvedLimit) {
    return no("OVERSPEND", `card ${card.id} limit ${card.limit_minor} differs from the approved ${String(decision.approvedLimit)} (I2)`);
  }
  const committed = state.committed + card.limit_minor;
  const budget = state.terms.budgetMinor;
  if (!Number.isSafeInteger(committed + state.spent) || committed + state.spent > budget) {
    return no("OVERSPEND", `card ${card.id} takes committed ${committed} plus spent ${state.spent} over the sealed budget ${budget}`);
  }
  const cards = new Map([...state.cards, [card.id, { payloadHash, limit: card.limit_minor, state: "ACTIVE" as const }]]);
  return ok({ ...state, committed, cards, mints: new Map([...state.mints, [card.decision_id, card.id]]) });
}

/** (c) A charge needs a minted, still active card and stays within its limit; voids and expiries release it. */
function onEvent(event: CardEvent, state: Semantics): SemanticStep {
  const card = state.cards.get(event.card_id);
  if (event.event === "DECLINED") return ok(state);
  if (event.event !== "AUTHORISED") {
    if (card?.state !== "ACTIVE") return ok(state); // nothing committed to release
    const cards = new Map([...state.cards, [event.card_id, { ...card, state: event.event }]]);
    return ok({ ...state, cards, committed: state.committed - card.limit });
  }
  if (card === undefined) return no("NO_DECISION", `charge on card ${event.card_id}, which this log never minted`);
  if (card.state !== "ACTIVE") return no("OVERSPEND", `charge on card ${event.card_id}, which is already ${card.state} (single use)`);
  const amount = event.amount_minor ?? Number.POSITIVE_INFINITY;
  if (amount > card.limit) return no("OVERSPEND", `charge of ${amount} on card ${event.card_id} is over its limit ${card.limit}`);
  const cards = new Map([...state.cards, [event.card_id, { ...card, state: "USED" as const }]]);
  return ok({ ...state, cards, committed: state.committed - card.limit, spent: state.spent + amount });
}

/** Step 9 for one entry that passed steps 1-7. */
export function checkSemantics(entry: LogEntry, state: Semantics): SemanticStep {
  switch (entry.kind) {
    case "DECISION":
      return onDecision(entry.payload, entry.seq, entry.payload_hash, state);
    case "CARD_MINTED":
      return onMinted(entry.payload, entry.payload_hash, state);
    case "CARD_EVENT":
      return onEvent(entry.payload, state);
    case "MANDATE_REVOKED":
    case "PACKET_EXPIRED":
      return ok({ ...state, closed: state.closed ?? `${entry.kind} at seq ${entry.seq}` });
    case "MANDATE_SEALED":
      return ok(state);
  }
}
