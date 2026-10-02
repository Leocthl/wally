// Read-only views over one packet log. The log is the only state: cards, escalations and revocation are
// derived here from the entries, never kept on the side. Pure functions, no I/O.
import type { CardRecord, Decision, LogEntry, MandateCredential } from "../generated";
import type { CardView, EscalationView } from "./types";

export function credentialOf(entries: readonly LogEntry[]): MandateCredential | null {
  const first = entries[0];
  return first?.kind === "MANDATE_SEALED" ? first.payload : null;
}

export function decisions(entries: readonly LogEntry[]): readonly Decision[] {
  return entries.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : []));
}

export function findDecision(entries: readonly LogEntry[], id: string): Decision | undefined {
  return decisions(entries).find((d) => d.id === id);
}

export function findMinted(entries: readonly LogEntry[], cardId: string): CardRecord | undefined {
  return entries.flatMap((e) => (e.kind === "CARD_MINTED" && e.payload.id === cardId ? [e.payload] : []))[0];
}

export const isRevoked = (entries: readonly LogEntry[]): boolean => entries.some((e) => e.kind === "MANDATE_REVOKED");
export const hasPacketExpired = (entries: readonly LogEntry[]): boolean => entries.some((e) => e.kind === "PACKET_EXPIRED");

/** The card without its rail handle (the handle stays inside the log and the executor). */
export function toCardView(card: CardRecord): CardView {
  const { handle: _handle, ...view } = card;
  return view;
}

const NEXT_STATE: Readonly<Record<string, CardRecord["state"] | undefined>> = { AUTHORISED: "USED", VOIDED: "VOIDED", EXPIRED: "EXPIRED" };

/** Every minted card with its state folded from CARD_EVENTs (a state only changes from ACTIVE; DECLINED holds). */
export function cardViews(entries: readonly LogEntry[]): readonly CardView[] {
  const minted = entries.flatMap((e) => (e.kind === "CARD_MINTED" ? [toCardView(e.payload)] : []));
  return minted.map((card) =>
    entries.reduce<CardView>((current, e) => {
      if (e.kind !== "CARD_EVENT" || e.payload.card_id !== card.id || current.state !== "ACTIVE") return current;
      const next = NEXT_STATE[e.payload.event];
      return next === undefined ? current : { ...current, state: next };
    }, card),
  );
}

export function activeCardIds(entries: readonly LogEntry[]): readonly string[] {
  return cardViews(entries)
    .filter((c) => c.state === "ACTIVE")
    .map((c) => c.id);
}

/** The UI-shaped view of one ESCALATE decision in a given state; null when it carries no escalation block. */
export function escalationViewOf(decision: Decision, state: EscalationView["state"]): EscalationView | null {
  const template = decision.explanation?.template_id;
  const expiresAt = decision.escalation?.expires_at;
  if (template === undefined || expiresAt === undefined) return null;
  return {
    decisionId: decision.id,
    templateId: template,
    ruleId: template.split(".")[0] ?? template,
    state,
    openedAt: decision.decided_at,
    expiresAt,
    totalMinor: decision.cart.total_minor,
    merchantName: decision.cart.merchant.name,
  };
}

/** Every ESCALATE in the log, with the state its resolving decision recorded (OPEN while none exists). */
export function escalationViews(entries: readonly LogEntry[]): readonly EscalationView[] {
  const all = decisions(entries);
  return all.flatMap((d) => {
    if (d.outcome !== "ESCALATE") return [];
    const resolution = all.find((r) => r.resolves === d.id);
    const view = escalationViewOf(d, resolution?.escalation?.state ?? (resolution === undefined ? "OPEN" : "DENIED"));
    return view === null ? [] : [view];
  });
}

export function escalationView(entries: readonly LogEntry[], decisionId: string): EscalationView | null {
  return escalationViews(entries).find((v) => v.decisionId === decisionId) ?? null;
}
