// The cart seam. Scenario carts are built by core's buildCart, the function the orchestrator calls, from the same
// inputs: the recorded proposal, the listing record, the mandate, the decision time and the Scameter capture. B0 and B1
// read these carts, and the orchestrator rebuilds them for B2; a test checks that the two agree.
import { buildCart } from "@wally/core/cart";
import type { Cart, ListingRecord, Mandate, ProposeCartInput, ScameterCapture } from "@wally/core/generated";

export interface CartInput {
  readonly cartId: string;
  readonly mandate: Mandate;
  readonly listing: ListingRecord;
  readonly proposal: ProposeCartInput;
  /** null = no Scameter capture for this seller (NOT_CHECKED). */
  readonly scameter: ScameterCapture | null;
  readonly now: Date;
}

/** The id the cart builder gives the nth submission of a scenario: the scenario's own for the first, a suffixed one for a repeat. */
export const cartIdFor = (cartId: string, submission: number): string => (submission === 0 ? cartId : `${cartId}r${submission + 1}`);

/** The cart a repeated submission gets: the same cart under a fresh id, which is what the builder does for a repeat. */
export const cartOfSubmission = (cart: Cart, submission: number): Cart => (submission === 0 ? cart : { ...cart, id: cartIdFor(cart.id, submission) });

/** The capture lookup the cart builder is given: the one capture this scenario has, by its reference. */
export const scameterLookup = (capture: ScameterCapture | null) => (ref: string): ScameterCapture | null => (capture?.capture_ref === ref ? capture : null);

/** Throws when the builder refuses: a generator that proposes an unbuildable cart is a bug, and it fails at the source. */
export function buildScenarioCart(input: CartInput): Cart {
  const built = buildCart({
    proposal: input.proposal,
    listings: [input.listing],
    mandate: input.mandate,
    now: input.now,
    ids: { cartId: () => input.cartId },
    scameterByRef: scameterLookup(input.scameter),
  });
  if (!built.ok) throw new Error(`cart builder refused (${built.code}): ${built.detail}`);
  return built.cart;
}
