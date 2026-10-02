// Receipts: one plain record per signed log entry (the list on #/receipts). Pure functions only: the screen turns these
// fields into words in the current language. Amounts stay integer minor units; times stay ISO strings.
import type { LogEntry } from "../../api/types";
import { decisionIdFromHash } from "../../hooks/useRoute";

export type ReceiptState =
  | "sealed"
  | "approved"
  | "stopped"
  | "needsOk"
  | "cardMade"
  | "paid"
  | "declined"
  | "voided"
  | "cardExpired"
  | "revoked"
  | "expired";

export type ReceiptFilter = "all" | "approved" | "stopped" | "needsOk" | "cards";
export const RECEIPT_FILTERS: readonly ReceiptFilter[] = ["all", "approved", "stopped", "needsOk", "cards"];

export interface Receipt {
  readonly seq: number;
  readonly kind: LogEntry["kind"];
  readonly state: ReceiptState;
  readonly ts: string;
  readonly hash: string;
  /** The DECISION this entry belongs to: its own id, a card's decision, or a card event's card's decision. */
  readonly decisionId: string | null;
  readonly merchant: string | null;
  /** First item title; moreItems counts the rest. */
  readonly item: string | null;
  readonly moreItems: number;
  readonly amountMinor: number | null;
  /** Provenance of the cart the amount came from; null for amounts that are not a cart (budget, card limit). */
  readonly cartProvenance: "OBSERVED" | "SIMULATED" | null;
  readonly priceObservedAt: string | null;
  readonly templateId: string | null;
  readonly declineCode: string | null;
  /** The earlier decision this one closes (an escalation answered or expired, a checkout voided). */
  readonly resolves: string | null;
}

interface Links {
  readonly decisions: ReadonlyMap<string, Extract<LogEntry, { kind: "DECISION" }>["payload"]>;
  readonly cards: ReadonlyMap<string, string>;
}

const BASE = { decisionId: null, merchant: null, item: null, moreItems: 0, amountMinor: null, cartProvenance: null, priceObservedAt: null, templateId: null, declineCode: null, resolves: null } as const;

function links(entries: readonly LogEntry[]): Links {
  const decisions = new Map<string, Extract<LogEntry, { kind: "DECISION" }>["payload"]>();
  const cards = new Map<string, string>();
  for (const e of entries) {
    if (e.kind === "DECISION") decisions.set(e.payload.id, e.payload);
    if (e.kind === "CARD_MINTED") cards.set(e.payload.id, e.payload.decision_id);
  }
  return { decisions, cards };
}

const CARD_EVENT_STATE = { AUTHORISED: "paid", DECLINED: "declined", VOIDED: "voided", EXPIRED: "cardExpired" } as const;
const OUTCOME_STATE = { APPROVE: "approved", DENY: "stopped", ESCALATE: "needsOk" } as const;

function merchantOf(link: Links, decisionId: string | null): string | null {
  return decisionId === null ? null : (link.decisions.get(decisionId)?.cart.merchant.name ?? null);
}

function fields(entry: LogEntry, link: Links): Omit<Receipt, "seq" | "kind" | "ts" | "hash"> {
  switch (entry.kind) {
    case "MANDATE_SEALED":
      return { ...BASE, state: "sealed", amountMinor: entry.payload.credentialSubject.rules.budget.amount_minor };
    case "DECISION": {
      const d = entry.payload;
      const [first, ...rest] = d.cart.items;
      return {
        ...BASE,
        state: OUTCOME_STATE[d.outcome],
        decisionId: d.id,
        merchant: d.cart.merchant.name,
        item: first.title,
        moreItems: rest.length,
        amountMinor: d.cart.total_minor,
        cartProvenance: d.cart.provenance,
        priceObservedAt: d.cart.price_observed_at,
        templateId: d.explanation?.template_id ?? null,
        resolves: d.resolves ?? null,
      };
    }
    case "CARD_MINTED": {
      const decisionId = entry.payload.decision_id;
      return { ...BASE, state: "cardMade", decisionId, merchant: merchantOf(link, decisionId) ?? entry.payload.merchant_lock ?? null, amountMinor: entry.payload.limit_minor };
    }
    case "CARD_EVENT": {
      const e = entry.payload;
      const decisionId = link.cards.get(e.card_id) ?? null;
      return {
        ...BASE,
        state: CARD_EVENT_STATE[e.event],
        decisionId,
        merchant: merchantOf(link, decisionId) ?? e.merchant_domain ?? null,
        amountMinor: e.amount_minor ?? null,
        declineCode: e.decline_code ?? null,
      };
    }
    case "MANDATE_REVOKED":
      return { ...BASE, state: "revoked" };
    case "PACKET_EXPIRED":
      return { ...BASE, state: "expired" };
  }
}

/** Log order (seq ascending). Unknown shapes never throw: the log was validated by the engine that wrote it. */
export function toReceipts(entries: readonly LogEntry[]): readonly Receipt[] {
  const link = links(entries);
  return entries.map((entry) => ({ seq: entry.seq, kind: entry.kind, ts: entry.ts, hash: entry.entry_hash, ...fields(entry, link) }));
}

export function newestFirst(receipts: readonly Receipt[]): readonly Receipt[] {
  return [...receipts].sort((a, b) => b.seq - a.seq);
}

const FILTER_OF: Readonly<Record<ReceiptState, Exclude<ReceiptFilter, "all"> | null>> = {
  sealed: null,
  approved: "approved",
  stopped: "stopped",
  needsOk: "needsOk",
  cardMade: "cards",
  paid: "cards",
  declined: "cards",
  voided: "cards",
  cardExpired: "cards",
  revoked: null,
  expired: null,
};

export function matchesFilter(receipt: Receipt, filter: ReceiptFilter): boolean {
  return filter === "all" || FILTER_OF[receipt.state] === filter;
}

export function countByFilter(receipts: readonly Receipt[]): Readonly<Record<ReceiptFilter, number>> {
  const counts = { all: receipts.length, approved: 0, stopped: 0, needsOk: 0, cards: 0 };
  for (const r of receipts) {
    const f = FILTER_OF[r.state];
    if (f !== null) counts[f] += 1;
  }
  return counts;
}

/** Hong Kong is UTC+8 all year. */
const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function hkDayKey(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "unknown" : new Date(ms + HKT_OFFSET_MS).toISOString().slice(0, 10);
}

export interface DayGroup {
  readonly key: string;
  readonly receipts: readonly Receipt[];
}

/** Consecutive receipts on the same Hong Kong day share a group; the input order is kept. */
export function groupByDay(receipts: readonly Receipt[]): readonly DayGroup[] {
  const groups: DayGroup[] = [];
  for (const r of receipts) {
    const key = hkDayKey(r.ts);
    const last = groups.at(-1);
    if (last && last.key === key) groups[groups.length - 1] = { key, receipts: [...last.receipts, r] };
    else groups.push({ key, receipts: [r] });
  }
  return groups;
}

export type DayLabel = { readonly kind: "today" | "yesterday" } | { readonly kind: "date"; readonly date: Date } | { readonly kind: "unknown" };

/** Today and Yesterday relative to now (Hong Kong days); otherwise the day at noon HKT, for a locale formatter. */
export function dayLabel(key: string, now: Date): DayLabel {
  const today = hkDayKey(now.toISOString());
  if (key === today) return { kind: "today" };
  if (key === hkDayKey(new Date(now.getTime() - DAY_MS).toISOString())) return { kind: "yesterday" };
  const date = new Date(`${key}T12:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? { kind: "unknown" } : { kind: "date", date };
}

/** #/receipts?d=<decisionId> (the old ?decision= reads the same); null when absent or not an id. */
export function decisionFromHash(hash: string): string | null {
  return decisionIdFromHash(hash);
}

/** The DECISION receipt for an id, else the first entry linked to it. */
export function receiptForDecision(receipts: readonly Receipt[], decisionId: string): Receipt | undefined {
  return receipts.find((r) => r.kind === "DECISION" && r.decisionId === decisionId) ?? receipts.find((r) => r.decisionId === decisionId);
}
