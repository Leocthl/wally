// Packet fold for the mock (docs/00 Packet accounting): commit on CARD_MINTED, release on VOIDED or EXPIRED,
// settle on AUTHORISED with the actual amount. A pure fold of the log; lane A's foldPacket replaces it.
import type { CardRecord, LogEntry, Mandate, PacketState } from "@wally/core/generated";

type CardState = CardRecord["state"];

interface FoldedCard {
  readonly record: CardRecord;
  readonly state: CardState;
}

function applyEvent(cards: ReadonlyMap<string, FoldedCard>, entry: Extract<LogEntry, { kind: "CARD_EVENT" }>): ReadonlyMap<string, FoldedCard> {
  const ev = entry.payload;
  const card = cards.get(ev.card_id);
  if (!card || card.state !== "ACTIVE") return cards;
  const next: CardState | null = ev.event === "AUTHORISED" ? "USED" : ev.event === "VOIDED" ? "VOIDED" : ev.event === "EXPIRED" ? "EXPIRED" : null;
  return next ? new Map([...cards, [ev.card_id, { ...card, state: next }]]) : cards;
}

/** Cards with their folded state, in mint order. */
export function foldCards(entries: readonly LogEntry[]): readonly CardRecord[] {
  let cards: ReadonlyMap<string, FoldedCard> = new Map();
  for (const entry of entries) {
    if (entry.kind === "CARD_MINTED") cards = new Map([...cards, [entry.payload.id, { record: entry.payload, state: "ACTIVE" }]]);
    else if (entry.kind === "CARD_EVENT") cards = applyEvent(cards, entry);
  }
  return [...cards.values()].map((c) => ({ ...c.record, state: c.state }));
}

function settledAmounts(entries: readonly LogEntry[]): number {
  return entries.reduce((sum, e) => (e.kind === "CARD_EVENT" && e.payload.event === "AUTHORISED" ? sum + (e.payload.amount_minor ?? 0) : sum), 0);
}

function openEscalations(entries: readonly LogEntry[]): PacketState["open_escalations"] {
  const decisions = entries.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : []));
  const resolved = new Set(decisions.flatMap((d) => (d.resolves ? [d.resolves] : [])));
  return decisions.flatMap((d) =>
    d.outcome === "ESCALATE" && d.escalation && !resolved.has(d.id) ? [{ decision_id: d.id, expires_at: d.escalation.expires_at }] : [],
  );
}

function statusOf(entries: readonly LogEntry[], remaining: number, validUntil: string, now: Date): PacketState["status"] {
  if (entries.some((e) => e.kind === "MANDATE_REVOKED")) return "REVOKED";
  if (entries.some((e) => e.kind === "PACKET_EXPIRED") || now.getTime() >= Date.parse(validUntil)) return "EXPIRED";
  return remaining === 0 ? "EXHAUSTED" : "ACTIVE";
}

export function foldMockPacket(entries: readonly LogEntry[], mandate: Mandate, logId: string, now: Date): PacketState {
  const cards = foldCards(entries);
  const active = cards.filter((c) => c.state === "ACTIVE");
  const committed = active.reduce((sum, c) => sum + c.limit_minor, 0);
  const spent = settledAmounts(entries);
  const budget = mandate.rules.budget.amount_minor;
  const remaining = budget - committed - spent;
  return {
    mandate_id: mandate.id,
    log_id: logId,
    budget_minor: budget,
    committed_minor: committed,
    spent_minor: spent,
    remaining_minor: remaining,
    currency: "HKD",
    active_cards: active.map((c) => ({ id: c.id, limit_minor: c.limit_minor, expires_at: c.expires_at })),
    mint_times: cards.map((c) => c.minted_at),
    open_escalations: openEscalations(entries),
    status: statusOf(entries, remaining, mandate.valid_until, now),
    expires_at: mandate.valid_until,
    folded_through_seq: entries.length - 1,
    computed_at: now.toISOString().replace(".000Z", "Z"),
  };
}
