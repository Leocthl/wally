// Limits the mock engine enforces. Each value cites its facts-register row. When @wally/core/config lands (lane A),
// import from there instead and delete this file; these are copies for the offline booth, not new decisions.

export const MOCK_CONFIG = {
  /** F1.ceiling: HK$2,000 per card, in minor units. */
  railCeilingMinor: 200_000,
  /** F1.active: at most 2 cards at once. */
  maxActiveCards: 2,
  /** F30: card TTL after mint, 30 min. */
  cardTtlMs: 30 * 60 * 1000,
  /** F31: escalation window, 60 s, then R11 DENY. */
  escalationWindowMs: 60 * 1000,
  /** F32: more than 3 approved mints in a rolling 10 min => DENY. */
  velocityMaxMints: 3,
  velocityWindowMs: 10 * 60 * 1000,
  /** F52: Scameter capture max age, 24 h. */
  maxCaptureAgeMs: 24 * 60 * 60 * 1000,
  /** F36 judge thresholds v0 (typed profile) and F50 for escalate_or_proceed. */
  judge: {
    tInj: 0.39,
    tSellDeny: 0.86,
    tSellEsc: 0.85,
    tScope: 0.63,
    tEsc: 0.5,
  },
  /** F26 truncation: about 940 state tokens fit per row. */
  judgeStateTokens: 940,
} as const;

/**
 * Mock-only estimate of tokens from characters, to decide when the (mock) judge "saw a truncated listing".
 * The live server reports usage.truncated instead (F26), so this number never reaches a real decision.
 */
export const CHARS_PER_TOKEN_ESTIMATE = 4;

/** The F22 storyline gap (HK$30 shipping pushes HK$21 under to HK$9 over), reused for the SIMULATED overshoot and price drift. */
export const STORY_GAP = {
  /** F22: subtotal HK$520 against HK$541 left. */
  underMinor: 2_100,
  /** F22: shipping HK$30. */
  shippingMinor: 3_000,
  /** F22: the total ends HK$9 over what is left. Reused as the SIMULATED overshoot and drift amount. */
  overMinor: 900,
} as const;

/**
 * Display pacing for the mock trace. Planner and judge pauses come from the recorded fixture latencies [F59];
 * engine, sign and rail pauses are presentation only. They are never shown as measurements (chips say SIMULATED).
 */
export const DISPLAY_PACING_MS = {
  engine: 60,
  sign: 40,
  rail: 110,
  beat: 220,
} as const;
