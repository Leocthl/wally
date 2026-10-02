// Executor configuration. Every value cites its register row; a missing row is stated, never invented.

export const EXECUTOR_DEFAULTS = Object.freeze({
  /**
   * Upper bound on merchant.checkout calls for one checkout attempt (the first call plus retries), all with
   * the SAME idempotency key so the rail charges at most once. ASSUMED: no register row exists for this bound
   * yet (the lane report asks for one). Backoff is omitted on purpose: the merchant is SIMULATED and replays
   * must stay deterministic and fast.
   */
  maxCheckoutCalls: 3,
});

/** CardEvent.idempotency_key pattern (log-entry.schema.json). */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

/** LogId pattern (mandate.schema.json). */
export const LOG_ID_PATTERN = /^log_[A-Za-z0-9]{6,40}$/;

/** Prefix of the keys the executor derives itself: chk:<card id>:<attempt number>. */
export const CHECKOUT_KEY_PREFIX = "chk";
