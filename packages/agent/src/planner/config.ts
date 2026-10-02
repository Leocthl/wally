// Planner configuration. Every default cites its source. The planner has no keys: the only environment
// names it reads are PLANNER_PROVIDER and LAYA_URL (I4, lint and tests enforce).

export interface PlannerConfig {
  /**
   * Smallest gap between the top two averaged probabilities that still counts as a decision.
   * ASSUMED starting point, no register row yet (requested in the lane report). Tuned on the running
   * Laya server on 2026-10-02, 16 item questions over 7 invented apparel items, not an evaluation:
   * explicit requests scored 0.59 to 0.82 or more, tied ones (two tees, "socks or a hoodie") 0.12 to 0.36.
   * 0.45 sits in the gap.
   */
  readonly marginThreshold: number;
  /** Most typed decisions (traced steps) in one propose or alternatives call. Lane brief; no register row yet. */
  readonly stepCap: number;
  /**
   * Most item or variant options per question, not counting the none option. 9 rows is the
   * measured request shape in F26 (option-order rotations, p50 344.6 ms, p95 430.8 ms).
   */
  readonly maxOptions: number;
  /**
   * Longest request text sent to Laya. About 940 state tokens fit one row before Laya silently drops
   * the rest [F26]; 1,000 characters stay far below that. Longer requests fail closed.
   */
  readonly maxRequestChars: number;
}

export const DEFAULT_PLANNER_CONFIG: PlannerConfig = {
  marginThreshold: 0.45,
  stepCap: 6,
  maxOptions: 8,
  maxRequestChars: 1_000,
};

/** Laya server started by services/laya/serve.sh; loopback only, port fixed there [F11c]. */
export const DEFAULT_LAYA_URL = "http://127.0.0.1:8808";

/** The checkpoint the planner always pins: without it the router picks an uninstalled one (FINDINGS). */
export const LAYA_MODEL = "typed-decisions";

export class PlannerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlannerConfigError";
  }
}

export function resolveConfig(patch: Partial<PlannerConfig> | undefined): PlannerConfig {
  return { ...DEFAULT_PLANNER_CONFIG, ...patch };
}
