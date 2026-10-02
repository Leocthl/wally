// Builds the planner's only output: ProposeCartInput { listing_url, items[{title, qty}], note? }.
// No money fields exist in the shape; the cart builder prices from the listing record (I4).
import type { ProposeCartInput } from "@laisee/core/ports";
import { validateProposeCartInput } from "@laisee/core/schema";
import type { PlannerCandidate } from "./candidates";

/** Estimated order total in minor units, used only to compare against a budget stop, never emitted. */
export function estimateTotalMinor(candidate: PlannerCandidate, qty: number): number {
  return qty * candidate.unitPriceMinor + candidate.shippingMinor + candidate.feesMinor;
}

/** The note is display only: exact title from the listing record plus a fixed phrase. */
export function buildProposal(candidate: PlannerCandidate, qty: number, how: string): ProposeCartInput | null {
  const proposal: ProposeCartInput = {
    listing_url: candidate.listingUrl,
    items: [{ title: candidate.title, qty }],
    note: `${how}: ${candidate.baseName}.`.slice(0, 280),
  };
  return validateProposeCartInput(proposal).ok ? proposal : null;
}
