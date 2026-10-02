// Does what a system did match what the generator said should happen? A diagnostic, not an acceptance rule: a mismatch
// is either a bug in the system under test or a bug in the label, and the result file lists them so one can tell which.
import type { PaymentExpectation, Scenario } from "../types";
import type { RunOutcome } from "../systems/types";

export interface Agreement {
  readonly decision: boolean;
  readonly payment: boolean;
  readonly all: boolean;
  readonly reason: string | null;
}

function decisionReason(s: Scenario, o: RunOutcome): string | null {
  const { label } = s;
  if (o.error !== null) return `error: ${o.error}`;
  if (o.decision.outcome !== label.decision) return `decision ${o.decision.outcome}, expected ${label.decision}`;
  // B0 has no rules, so it names none.
  if (label.decision === "APPROVE" || o.baseline === "B0") return null;
  if (o.decision.rule !== label.rule) return `rule ${String(o.decision.rule)}, expected ${String(label.rule)}`;
  if (label.templateId !== null && o.decision.templateId !== label.templateId) return `template ${String(o.decision.templateId)}, expected ${label.templateId}`;
  return null;
}

function paymentReason(s: Scenario, o: RunOutcome, expected: PaymentExpectation): string | null {
  const { label, cart } = s;
  const declined = (code: string): boolean => o.events.some((e) => e.event === "DECLINED" && e.declineCode === code);
  if (o.mints.length !== label.expectedMints) return `${o.mints.length} mints, expected ${label.expectedMints}`;
  if (label.decision === "APPROVE" && o.decision.decisionIds.length !== 1) return `${o.decision.decisionIds.length} decisions for one cart`;
  switch (expected.kind) {
    case "none":
      return o.authorisedCount === 0 ? null : `charged ${o.authorisedCount} time(s), expected none`;
    case "authorised":
      if (o.authorisedCount !== 1 || o.authorisedMinor !== cart.total_minor) return `authorised ${o.authorisedCount}x for ${o.authorisedMinor}, expected one charge of ${cart.total_minor}`;
      return label.replayDeclined && !declined("CARD_USED") ? "replayed charge was not declined CARD_USED" : null;
    case "voided":
      if (o.authorisedCount !== 0) return `charged ${o.authorisedCount} time(s), expected a void`;
      if (!o.events.some((e) => e.event === "VOIDED")) return "card was not voided";
      return label.rule === "R12" && !o.r12Void ? "price drift was not detected" : null;
    case "declined":
      if (o.authorisedCount !== 0) return `charged ${o.authorisedCount} time(s), expected a decline`;
      return declined(expected.code) ? null : `no ${expected.code} decline`;
  }
}

export function labelAgreement(s: Scenario, o: RunOutcome): Agreement {
  const d = decisionReason(s, o);
  const p = d === null ? paymentReason(s, o, s.label.payment) : null;
  return { decision: d === null, payment: d === null && p === null, all: d === null && p === null, reason: d ?? p };
}
