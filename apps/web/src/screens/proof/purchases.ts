// One purchase, one row. The signed log writes several receipts for one purchase (the decision, the one-off card, the charge, and
// any answer to a question in between), and a list that shows each of them reads as three charges. This groups the receipts of a
// purchase by the decision it started with (following `resolves` back to the root), words where it ended up, and leaves the
// receipts that belong to no purchase (the budget sealed, cancelled or ended) as rows of their own. Pure: no React, no clock.
// The receipts themselves stay as they are; the group only decides which ones a row lists.
import type { Receipt, ReceiptFilter, ReceiptState } from "./receipts";
import { matchesFilter } from "./receipts";

/** Where a purchase stands now, in the receipt state words the rows already use. */
export type PurchaseState = Extract<ReceiptState, "paid" | "approved" | "stopped" | "needsOk" | "voided" | "cardExpired">;

export interface Purchase {
  /** The root decision's id: one per purchase, stable while the purchase grows. */
  readonly id: string;
  /** Every receipt of the purchase, oldest first. */
  readonly steps: readonly Receipt[];
  /** The decision the purchase started with: its shop, item and amount, and its receipt number. */
  readonly lead: Receipt;
  /** The receipt that tells where it ended up: what the row opens. */
  readonly headline: Receipt;
  readonly state: PurchaseState;
  /** What the cart came to when it was decided. */
  readonly amountMinor: number | null;
}

/** A row: a purchase with its receipts, or a receipt on its own. `seq` and `ts` are those of the newest receipt in it. */
export type ReceiptItem =
  | { readonly kind: "purchase"; readonly purchase: Purchase; readonly seq: number; readonly ts: string }
  | { readonly kind: "single"; readonly receipt: Receipt; readonly seq: number; readonly ts: string };

const MAX_DEPTH = 16;

function rootOf(parents: ReadonlyMap<string, string | null>, id: string): string {
  let at = id;
  for (let i = 0; i < MAX_DEPTH; i += 1) {
    const parent = parents.get(at);
    if (parent === null || parent === undefined || !parents.has(parent)) return at;
    at = parent;
  }
  return at;
}

const last = <T>(list: readonly T[]): T | undefined => list[list.length - 1];

/** Where the purchase ended up, and the receipt that says so. A charge beats everything; then how the decisions ended; then the card. */
function outcomeOf(steps: readonly Receipt[]): { readonly state: PurchaseState; readonly headline: Receipt } | null {
  const decisions = steps.filter((r) => r.kind === "DECISION");
  const finalDecision = last(decisions);
  if (finalDecision === undefined) return null;
  const paid = last(steps.filter((r) => r.state === "paid"));
  if (paid !== undefined) return { state: "paid", headline: paid };
  if (finalDecision.state === "stopped") return { state: "stopped", headline: finalDecision };
  if (finalDecision.state === "needsOk") return { state: "needsOk", headline: finalDecision };
  const voided = last(steps.filter((r) => r.state === "voided"));
  if (voided !== undefined) return { state: "voided", headline: voided };
  const expired = last(steps.filter((r) => r.state === "cardExpired"));
  if (expired !== undefined) return { state: "cardExpired", headline: expired };
  return { state: "approved", headline: finalDecision };
}

function toItem(single: Receipt): ReceiptItem {
  return { kind: "single", receipt: single, seq: single.seq, ts: single.ts };
}

/** Every receipt as a row of its own: the flat list developer mode keeps. */
export function asSingles(receipts: readonly Receipt[]): readonly ReceiptItem[] {
  return receipts.map(toItem);
}

function purchaseItem(id: string, steps: readonly Receipt[]): readonly ReceiptItem[] {
  const outcome = outcomeOf(steps);
  const lead = steps.find((r) => r.kind === "DECISION" && r.resolves === null) ?? steps.find((r) => r.kind === "DECISION");
  const newest = last(steps);
  // Receipts of a decision the log does not hold (a damaged copy) are not made into a purchase; each stands alone.
  if (outcome === null || lead === undefined || newest === undefined) return steps.map(toItem);
  const purchase: Purchase = { id, steps, lead, headline: outcome.headline, state: outcome.state, amountMinor: lead.amountMinor };
  return [{ kind: "purchase", purchase, seq: newest.seq, ts: newest.ts }];
}

/**
 * Receipts in log order to rows in order of their newest receipt (oldest first; the screen puts the newest on top). A row is a
 * purchase when its receipts hang on a decision, and a single receipt otherwise.
 */
export function groupPurchases(receipts: readonly Receipt[]): readonly ReceiptItem[] {
  const parents = new Map<string, string | null>();
  for (const r of receipts) if (r.kind === "DECISION" && r.decisionId !== null) parents.set(r.decisionId, r.resolves);
  const groups = new Map<string, Receipt[]>();
  const loose: Receipt[] = [];
  for (const r of receipts) {
    if (r.decisionId === null) {
      loose.push(r);
      continue;
    }
    const id = rootOf(parents, r.decisionId);
    groups.set(id, [...(groups.get(id) ?? []), r]);
  }
  const items = [...loose.map(toItem), ...[...groups].flatMap(([id, steps]) => purchaseItem(id, steps))];
  return items.sort((a, b) => a.seq - b.seq);
}

/** Newest row first. */
export function itemsNewestFirst(items: readonly ReceiptItem[]): readonly ReceiptItem[] {
  return [...items].sort((a, b) => b.seq - a.seq);
}

/** A purchase is in a filter when any of its receipts is: asked for your OK, approved, stopped, or made a card. */
export function itemMatchesFilter(item: ReceiptItem, filter: ReceiptFilter): boolean {
  if (filter === "all") return true;
  return item.kind === "single" ? matchesFilter(item.receipt, filter) : item.purchase.steps.some((r) => matchesFilter(r, filter));
}

export function countItemsByFilter(items: readonly ReceiptItem[]): Readonly<Record<ReceiptFilter, number>> {
  const filters: readonly Exclude<ReceiptFilter, "all">[] = ["approved", "stopped", "needsOk", "cards"];
  const counts = { all: items.length, approved: 0, stopped: 0, needsOk: 0, cards: 0 };
  for (const item of items) for (const f of filters) if (itemMatchesFilter(item, f)) counts[f] += 1;
  return counts;
}
