// Constants for the judge adapters. Every number either cites a register ID or says plainly that it has
// none yet (ASSUMED, to be added to docs/facts-register.md by the lead). Thresholds are NOT here: R10 reads
// them from core config [F36, F50]; an adapter only reports probabilities.

/** Local Laya server, bound to loopback by services/laya/serve.sh [F11c]. */
export const DEFAULT_LAYA_BASE_URL = "http://127.0.0.1:8808";
/** Always sent: without it the router picks a checkpoint that is not installed and answers HTTP 500 (FINDINGS quirks). */
export const DEFAULT_LAYA_MODEL = "typed-decisions";
/** Hosted Jev, optional [F11b]. */
export const DEFAULT_JEV_BASE_URL = "https://api.typesafe.ai";
/** Pinned versioned id, as the docs advise when tuning thresholds [F11b]. */
export const DEFAULT_JEV_MODEL = "jev-1.13.0";

/** One endpoint for both providers: Laya serves Jev's wire format [F11b, F11c]. */
export const SYSTEM_ONE_PATH = "/v1/systemone";
/** Laya only: reports the loaded checkpoint commit per model. */
export const HEALTH_PATH = "/health";
/** Characters of the checkpoint commit kept as the record's version (matches the replay fixtures, `recorded@55cf4c4e`). */
export const VERSION_PREFIX_CHARS = 8;
/** Version label when neither /health nor the response names one. */
export const UNKNOWN_VERSION = "unknown";

/** Laya rounds probabilities to four decimals, so honest sums drift by well under this. ASSUMED, no register row yet. */
export const PROBABILITY_SUM_TOLERANCE = 0.01;
/** Decimals kept after averaging rotations (keeps logs short; Laya itself reports four). */
export const PROBABILITY_DECIMALS = 6;

/** Cap on a response body read from the judge server. ASSUMED, no register row yet (a 9-row answer is about 2 KiB). */
export const MAX_RESPONSE_BYTES = 1_048_576;
/** Laya refuses more than this many characters of state over HTTP (413) (FINDINGS option limits). */
export const MAX_STATE_CHARS = 50_000;

/** Cart summary limits. The cart and listing records cap titles at 120 characters and items at 20. */
export const MAX_INLINE_TEXT_CHARS = 120;
export const MAX_SUMMARY_ITEMS = 20;
/** Intent text limit from mandate.schema.json IntentText. */
export const MAX_INTENT_CHARS = 280;

/**
 * Stretch: windows for long listings. About 940 state tokens fit per row [F26] and the rest of the state
 * takes roughly 150, so 2,000 characters (about 3.4 characters per token, measured on this server) leave margin.
 * ASSUMED, no register row yet.
 */
export const DEFAULT_WINDOW_CHARS = 2_000;
export const DEFAULT_WINDOW_OVERLAP_CHARS = 250;
/** A listing needing more windows than this is not judged (ERROR, input_truncated). The listing record caps text at 4,000 characters. */
export const DEFAULT_MAX_WINDOWS = 4;

/** Model and version strings read from a server are clipped to this length before they reach a record. ASSUMED, no register row yet. */
export const MAX_NAME_CHARS = 80;

/**
 * Language gate (language.ts): a listing whose letters are at least this share CJK is not sent to the English-derived
 * checkpoint [F26]. ASSUMED, no register row yet (to be added by the lead). Basis, MEASURED on live Laya (checkpoint
 * 55cf4c4e, 2026-10-03, benign SIMULATED text): English listings score injection risk 0.30 to 0.36 against the 0.39
 * limit [F36]; Chinese listings 0.45 to 0.73. English plus one Chinese sentence scored 0.41 to 0.46 at a 10.8% share, and
 * a few Chinese words stayed at 0.31 to 0.39 at 7.5%. So false injection scores start at about a tenth, not at a third.
 * Known gap: a long English listing with one Chinese sentence can sit under this share and still scores about 0.15 higher.
 */
export const CJK_SHARE_PERCENT = 10;
