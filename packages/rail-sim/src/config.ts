// rail-sim configuration (SIMULATED rail). Every value cites its register row. No row, no number.

export const RAIL_LABEL = "SIMULATED";

/** The rail's own limits, mirroring the Single Use Card. Options on RailSim override them for tests. */
export const RAIL_SIM_DEFAULTS = Object.freeze({
  /** [F1.ceiling] HK$2,000 per card, as integer HKD minor units (cents). */
  ceilingMinor: 200_000,
  /** [F1.active] at most 2 cards ACTIVE at once. */
  maxActive: 2,
  /** [F30] card TTL after mint, 30 minutes in milliseconds; always also <= packet expiry and <= F1 validity. */
  maxTtlMs: 30 * 60 * 1000,
  /** [F1.validity] a card is valid for at most 2 months (calendar months, UTC). */
  validityMonths: 2,
});

/**
 * Size of the surcharge the merchant stub adds in its overshoot, drift and preauth scenarios: HK$30 in minor units.
 * SIMULATED scenario size, borrowed from the shipping line of the storyline cart [F22]; not a rail fact.
 * Override per demo with the stub options.
 */
export const SIMULATED_SURCHARGE_MINOR = 3_000;

/** Domain the stub charges from in wrong_merchant mode. The .example TLD never resolves. SIMULATED. */
export const WRONG_MERCHANT_DOMAIN = "wrong-merchant.example";

/** Card id the rail reports for a handle it never issued (UNKNOWN_HANDLE has no real card). */
export const UNKNOWN_CARD_ID = "crd_unknown";

/** Longest run of digits in a generated id or handle. Keeps every output far from a PAN-like run (I8). */
export const MAX_DIGIT_RUN = 4;

/** Retries when an injected id source returns an id already in use; then the mint fails closed. Internal bound. */
export const ID_COLLISION_RETRIES = 8;
