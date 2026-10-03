// Pure views of the booth state for the Budget screen. A new seal starts a new log and a new set of cards on the
// engine side and the reducer starts over with it (state/booth.ts), so everything in the state is the current budget's.
import type { CardRecord, Decision, EscalationView, LogEntry } from "../../api/types";
import type { BoothState } from "../../state/booth";
import { groupPurchases, itemsNewestFirst, type PurchaseState } from "../proof/purchases";
import { toReceipts } from "../proof/receipts";
import { plainName } from "../run/model/item";

/** One purchase in Recent: the same grouping and words as the Receipts list, so Home and Receipts say the same about it. */
export interface RecentRow {
  /** The decision the purchase started with; Wally's screen pins the whole purchase by it. */
  readonly id: string;
  /** The receipt number's source: the log sequence number of the receipt that tells how the purchase ended (what its Receipts row opens). */
  readonly seq: number;
  readonly state: PurchaseState;
  readonly title: string;
  readonly merchant: string;
  readonly totalMinor: number;
  readonly at: string;
}

/** The log of the budget in force. */
export function currentEntries(state: BoothState): readonly LogEntry[] {
  return state.log.entries;
}

function decisionOf(entry: LogEntry): Decision | null {
  if (entry.kind !== "DECISION") return null;
  const payload = entry.payload as Partial<Decision>;
  return typeof payload.id === "string" && payload.cart !== undefined && typeof payload.outcome === "string" ? (payload as Decision) : null;
}

/**
 * Newest first, one row per purchase: the decision, its one-off card, the charge and any answer to a question are one row,
 * worded by where the purchase ended up (paid, stopped, waiting for your OK).
 */
export function recentPurchases(state: BoothState, limit = 3): readonly RecentRow[] {
  const items = itemsNewestFirst(groupPurchases(toReceipts(currentEntries(state))));
  return items
    .flatMap((item): readonly RecentRow[] => {
      if (item.kind !== "purchase") return [];
      const { purchase } = item;
      return [
        {
          id: purchase.id,
          seq: purchase.headline.seq,
          state: purchase.state,
          title: plainName(purchase.lead.item ?? purchase.lead.merchant ?? ""),
          merchant: plainName(purchase.lead.merchant ?? ""),
          totalMinor: purchase.amountMinor ?? 0,
          at: item.ts,
        },
      ];
    })
    .slice(0, limit);
}

export interface CardGroups {
  readonly active: readonly CardRecord[];
  readonly past: readonly CardRecord[];
}

/** Cards of the budget in force, newest first: ready ones on top, used, cancelled and expired ones after. */
export function cardGroups(state: BoothState): CardGroups {
  const newest = [...state.cards].sort((a, b) => Date.parse(b.minted_at) - Date.parse(a.minted_at));
  return { active: newest.filter((c) => c.state === "ACTIVE"), past: newest.filter((c) => c.state !== "ACTIVE") };
}

/** A purchase went all the way through in this budget: a one-off card was charged. */
export function hasCompletedPurchase(state: BoothState): boolean {
  return currentEntries(state).some((e) => e.kind === "CARD_EVENT" && e.payload.event === "AUTHORISED");
}

/** Escalations still waiting for an answer, the oldest (first to expire) first. */
export function openEscalations(state: BoothState): readonly EscalationView[] {
  return state.escalations
    .filter((e) => e.state === "OPEN")
    .slice()
    .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
}

/** The title of the item behind a decision, for the escalation banner. */
export function decisionTitle(state: BoothState, decisionId: string): string | null {
  for (const e of currentEntries(state)) {
    const d = decisionOf(e);
    if (d?.id === decisionId) return plainName(d.cart.items[0]?.title ?? d.cart.merchant.name);
  }
  return null;
}
