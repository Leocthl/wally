// A price limit in a typed Ask ("a cotton tee under HK$50", "三百蚊以下"). The planner reads the request and proposes an item;
// it has no number to give (I4), so the proposal is priced here from the listing record with the cart builder's arithmetic
// (quantity times unit price, plus shipping and fees, integer minor units) and a cart above the limit the shopper typed is no
// proposal. The run then ends as NO_PROPOSAL, which the page already answers with the keyword reader's list of what the shop
// has under the limit. The limit is read by the same fixed reader as Show Wally a photo (@wally/agent/vision), so the two
// agree. A proposal is kept or dropped, never changed, so this can only tighten a run, and a proposal that cannot be priced
// while a limit was asked is dropped too (I5). Pure and portable (no node:*).
import { readPriceLimit } from "@wally/agent/vision";
import type { ListingRecord } from "@wally/core/generated";
import type { PlannerFactory } from "@wally/core/orchestrator";
import type { PlannerContext, PlannerPort, ProposeCartInput } from "@wally/core/ports";
import type { AskSource } from "./ask";

/**
 * What the cart builder would make this proposal cost: the sum of quantity times unit price, plus the listing's shipping and
 * fees. null when the listing or an item is not found exactly once or a quantity is not a whole number from 1.
 */
export function proposalTotalMinor(proposal: ProposeCartInput, listings: readonly ListingRecord[]): number | null {
  const found = listings.filter((l) => l.url === proposal.listing_url);
  const [record] = found;
  if (record === undefined || found.length > 1 || proposal.items.length === 0) return null;
  const lines = proposal.items.map((wanted) => {
    const sold = record.items.filter((i) => i.title === wanted.title);
    const [item] = sold;
    const whole = Number.isSafeInteger(wanted.qty) && wanted.qty >= 1;
    return item === undefined || sold.length > 1 || !whole ? null : wanted.qty * item.unit_price_minor;
  });
  if (!lines.every((line): line is number => line !== null)) return null;
  const total = lines.reduce((sum, line) => sum + line, record.shipping_minor + record.fees_minor);
  return Number.isSafeInteger(total) ? total : null;
}

const keyOf = (ids: readonly string[]): string => [...ids].sort().join("|");

/** The proposal if it fits the limit the request words name (or the words name none), else null. */
function withinLimit(proposal: ProposeCartInput | null, ctx: PlannerContext, listings: readonly ListingRecord[]): ProposeCartInput | null {
  if (proposal === null) return null;
  const limitMinor = readPriceLimit(ctx.intentText);
  if (limitMinor === null) return proposal;
  const total = proposalTotalMinor(proposal, listings);
  return total !== null && total <= limitMinor ? proposal : null;
}

function limited(planner: PlannerPort, listings: readonly ListingRecord[]): PlannerPort {
  const alternatives = planner.alternatives?.bind(planner);
  return {
    propose: async (ctx, opts) => withinLimit(await planner.propose(ctx, opts), ctx, listings),
    ...(alternatives === undefined ? {} : { alternatives: async (ctx, stop, opts) => withinLimit(await alternatives(ctx, stop, opts), ctx, listings) }),
  };
}

/**
 * Typed Ask on a live planner (the Laya rule planner or local Qwen): the planner is asked over the whole shelf, and its pick,
 * or its cheaper pick after a budget stop, is checked against the price limit in the request. Only a listing set that is the
 * whole shelf is checked: a fixed booth button, a photo pick and the Try to trick listing are fixtures, and the recorded
 * source (the on-device page) answers only the sample requests, so none of them can meet a limit.
 */
export function withAskLimit(inner: PlannerFactory, ask: AskSource): PlannerFactory {
  if (ask.kind !== "live") return inner;
  const shelfKey = keyOf(ask.shelf.map((l) => l.id));
  return (listings) => {
    const planner = inner(listings);
    return keyOf(listings.map((l) => l.id)) === shelfKey ? limited(planner, listings) : planner;
  };
}
