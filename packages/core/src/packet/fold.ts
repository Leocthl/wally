// foldPacket (A-02, U1): PacketState as a pure fold of one log, seq 0..n (packet-state.schema.json).
// Commit the limit on CARD_MINTED; release it on VOIDED or EXPIRED; AUTHORISED moves the actual amount
// to spent and releases the rest; DECLINED holds the limit. Integer cents. Browser-safe, no clock.
// A log the fold cannot trust throws PacketFoldError, so the caller decides nothing (fail closed, I5).
import type { CardRecord, Decision, LogEntry, MandateCredential, PacketState } from "../generated";
import type { CardEvent } from "../ports";
import { formatIssues, validateLogEntry } from "../schema";
import { mandateIdFromCredentialId } from "../vc/mandate";

export class PacketFoldError extends Error {
  readonly seq: number | null;
  constructor(seq: number | null, message: string) {
    super(seq === null ? message : `seq ${seq}: ${message}`);
    this.name = "PacketFoldError";
    this.seq = seq;
  }
}

type CardState = "ACTIVE" | "USED" | "VOIDED" | "EXPIRED";

interface TrackedCard {
  readonly limit: number;
  readonly expiresAt: string;
  readonly state: CardState;
}

interface FoldState {
  readonly cards: ReadonlyMap<string, TrackedCard>;
  readonly committed: number;
  readonly spent: number;
  readonly mintTimes: readonly string[];
  readonly open: ReadonlyMap<string, string>;
  readonly settled: ReadonlySet<string>;
  readonly revoked: boolean;
  readonly expired: boolean;
}

const EMPTY: FoldState = {
  cards: new Map(),
  committed: 0,
  spent: 0,
  mintTimes: [],
  open: new Map(),
  settled: new Set(),
  revoked: false,
  expired: false,
};

const isMoney = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function withCard(s: FoldState, id: string, card: TrackedCard): ReadonlyMap<string, TrackedCard> {
  return new Map([...s.cards, [id, card]]);
}

function applyMinted(s: FoldState, card: CardRecord): FoldState {
  if (s.cards.has(card.id)) return s; // the same card logged twice commits once
  const tracked: TrackedCard = { limit: card.limit_minor, expiresAt: card.expires_at, state: "ACTIVE" };
  return { ...s, cards: withCard(s, card.id, tracked), committed: s.committed + card.limit_minor, mintTimes: [...s.mintTimes, card.minted_at] };
}

function settleKey(ev: CardEvent): string {
  return `${ev.card_id}|${ev.idempotency_key ?? `${ev.at}|${String(ev.amount_minor)}`}`;
}

function applyAuthorised(s: FoldState, ev: CardEvent): FoldState {
  const key = settleKey(ev);
  if (s.settled.has(key)) return s; // a retry with the same idempotency key charged once
  const card = s.cards.get(ev.card_id);
  const amount = isMoney(ev.amount_minor) ? ev.amount_minor : (card?.limit ?? 0);
  const settled = new Set([...s.settled, key]);
  if (card?.state !== "ACTIVE") return { ...s, settled, spent: s.spent + amount }; // anomaly: count it (conservative)
  const cards = withCard(s, ev.card_id, { ...card, state: "USED" });
  return { ...s, cards, settled, committed: s.committed - card.limit, spent: s.spent + amount };
}

function applyRelease(s: FoldState, ev: CardEvent, state: "VOIDED" | "EXPIRED"): FoldState {
  const card = s.cards.get(ev.card_id);
  if (card?.state !== "ACTIVE") return s;
  return { ...s, cards: withCard(s, ev.card_id, { ...card, state }), committed: s.committed - card.limit };
}

function applyCardEvent(s: FoldState, ev: CardEvent): FoldState {
  switch (ev.event) {
    case "AUTHORISED":
      return applyAuthorised(s, ev);
    case "VOIDED":
    case "EXPIRED":
      return applyRelease(s, ev, ev.event);
    default:
      return s; // DECLINED: limit held
  }
}

function applyDecision(s: FoldState, d: Decision): FoldState {
  const remaining = [...s.open].filter(([id]) => id !== d.resolves);
  const opened: [string, string][] = d.outcome === "ESCALATE" && d.escalation !== undefined ? [[d.id, d.escalation.expires_at]] : [];
  return { ...s, open: new Map([...remaining, ...opened]) };
}

function applyEntry(s: FoldState, entry: LogEntry): FoldState {
  switch (entry.kind) {
    case "CARD_MINTED":
      return applyMinted(s, entry.payload);
    case "CARD_EVENT":
      return applyCardEvent(s, entry.payload);
    case "DECISION":
      return applyDecision(s, entry.payload);
    case "MANDATE_REVOKED":
      return { ...s, revoked: true };
    case "PACKET_EXPIRED":
      return { ...s, expired: true };
    default:
      throw new PacketFoldError(entry.seq, "a second MANDATE_SEALED in one log");
  }
}

function checkEntries(entries: readonly LogEntry[]): MandateCredential {
  const first = entries[0];
  if (first === undefined) throw new PacketFoldError(null, "empty log: no MANDATE_SEALED");
  entries.forEach((entry, index) => {
    const result = validateLogEntry(entry);
    if (!result.ok) throw new PacketFoldError(index, `entry fails log-entry schema: ${formatIssues(result.errors)}`);
    if (entry.seq !== index) throw new PacketFoldError(index, `seq ${entry.seq} out of order`);
    if (entry.log_id !== first.log_id) throw new PacketFoldError(index, `log_id ${entry.log_id} differs from ${first.log_id}`);
  });
  if (first.kind !== "MANDATE_SEALED") throw new PacketFoldError(0, "seq 0 must be MANDATE_SEALED");
  return first.payload;
}

function statusOf(s: FoldState, remaining: number, nowMs: number, untilMs: number): PacketState["status"] {
  if (s.revoked) return "REVOKED";
  if (s.expired || !Number.isFinite(untilMs) || nowMs >= untilMs) return "EXPIRED";
  return remaining === 0 ? "EXHAUSTED" : "ACTIVE";
}

/** Oldest first; equal times keep log order (Array.prototype.sort is stable). */
function sortedTimes(times: readonly string[]): string[] {
  return [...times].sort((a, b) => Date.parse(a) - Date.parse(b));
}

/** PacketState for `entries` (one whole log from seq 0) at `now`. Throws PacketFoldError on a log it cannot trust. */
export function foldPacket(entries: readonly LogEntry[], now: Date): PacketState {
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowMs)) throw new PacketFoldError(null, "invalid clock");
  const vc = checkEntries(entries);
  const s = entries.slice(1).reduce(applyEntry, EMPTY);
  const budget = vc.credentialSubject.rules.budget.amount_minor;
  const remaining = Math.max(0, budget - s.committed - s.spent); // clamps only a corrupted, over-committed log
  const activeCards = [...s.cards].filter(([, c]) => c.state === "ACTIVE").map(([id, c]) => ({ id, limit_minor: c.limit, expires_at: c.expiresAt }));
  return {
    mandate_id: mandateIdFromCredentialId(vc.id), // the credential id is a URN, the packet carries the mnd_ id
    log_id: entries[0]?.log_id ?? "",
    budget_minor: budget,
    committed_minor: s.committed,
    spent_minor: s.spent,
    remaining_minor: remaining,
    currency: vc.credentialSubject.rules.budget.currency,
    active_cards: activeCards,
    mint_times: sortedTimes(s.mintTimes),
    open_escalations: [...s.open].map(([decision_id, expires_at]) => ({ decision_id, expires_at })),
    status: statusOf(s, remaining, nowMs, Date.parse(vc.validUntil)),
    expires_at: vc.validUntil,
    folded_through_seq: entries.length - 1,
    computed_at: new Date(nowMs).toISOString(),
  };
}
