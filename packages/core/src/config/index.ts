// @laisee/core/config: every engine threshold, window and limit, each citing its facts-register row
// (docs/facts-register.md). Browser-safe: no node imports. Deeply frozen: change the register row
// first, then the value here. engine.config_sha256 pins the values in force (docs/02 section 9).

/** Judge thresholds, typed judge profile (Laya local, or Jev on the same wire protocol). */
export interface JudgeThresholds {
  /** P(suspicious) + P(injection) >= t_inj => DENY R10.injection. */
  readonly t_inj: number;
  /** P(high_risk) >= t_sell_deny => DENY R10.seller_risk. */
  readonly t_sell_deny: number;
  /** t_sell_esc <= P(high_risk) < t_sell_deny => ESCALATE R10.seller_risk. */
  readonly t_sell_esc: number;
  /** P(in_scope) < t_scope => ESCALATE R10.scope. */
  readonly t_scope: number;
  /** P(escalate) >= t_esc => ESCALATE R10.escalate. */
  readonly t_esc: number;
}

/** JUDGE_MODE (docs/02 section 15): enforce (default, the demo) or shadow. Never read from the judge record. */
export type JudgeMode = "enforce" | "shadow";

export interface EngineConfig {
  /** R10 effect. shadow records a usable reading as SKIPPED; an unusable record still ESCALATEs (I5). */
  readonly judge_mode: JudgeMode;
  readonly rail: { readonly ceiling_minor: number; readonly max_active_cards: number };
  readonly card: { readonly ttl_ms: number };
  readonly escalation: { readonly window_ms: number };
  readonly velocity: { readonly max_mints: number; readonly window_s: number };
  readonly seller: { readonly max_capture_age_s: number };
  readonly judge: JudgeThresholds;
  readonly timeouts: { readonly planner_ms: number; readonly judge_ms: number };
  readonly latency: { readonly decision_p95_ms: number };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const ENGINE_CONFIG: EngineConfig = deepFreeze({
  judge_mode: "enforce", // JUDGE_MODE default; the judge record's own shadow flag is informational (audit S-JUDGE-1)
  rail: {
    ceiling_minor: 200_000, // per-card limit ceiling [F1.ceiling] (R5)
    max_active_cards: 2, // active cards at once [F1.active] (R8)
  },
  card: {
    ttl_ms: 1_800_000, // card TTL after mint, also capped by packet expiry and F1 validity [F30]
  },
  escalation: {
    window_ms: 60_000, // escalation window, then R11 DENY [F31]
  },
  velocity: {
    max_mints: 3, // approved mints allowed in the window; one more => DENY [F32] (R7)
    window_s: 600, // rolling window [F32]
  },
  seller: {
    max_capture_age_s: 86_400, // older Scameter capture => unverified [F52] (R9)
  },
  judge: {
    t_inj: 0.39, // [F36.T_inj]
    t_sell_deny: 0.86, // [F36.T_sell_deny]
    t_sell_esc: 0.85, // [F36.T_sell_esc]
    t_scope: 0.63, // [F36.T_scope]
    t_esc: 0.5, // [F50.T_esc]
  },
  timeouts: {
    planner_ms: 20_000, // [F33]
    judge_ms: 1_500, // per judge call; failure => ESCALATE R10.unavailable [F34]
  },
  latency: {
    decision_p95_ms: 3_000, // cart proposed to verdict + mint, planner excluded [F35]
  },
});

/** A deep-frozen copy of a config, so the values in force cannot drift from engine.config_sha256. */
export function pinConfig(config: EngineConfig): EngineConfig {
  return deepFreeze(structuredClone(config));
}

/** threshold_ref values recorded on rule results (decision.schema.json RuleResult.threshold_ref). */
export const THRESHOLD_REFS = Object.freeze({
  ceiling: "F1.ceiling",
  active: "F1.active",
  velocity: "F32",
  capture_age: "F52",
  t_inj: "F36.T_inj",
  t_sell_deny: "F36.T_sell_deny",
  t_sell_esc: "F36.T_sell_esc",
  t_scope: "F36.T_scope",
  t_esc: "F50.T_esc",
  escalation_window: "F31",
} as const);

type Check = readonly [path: string, ok: boolean];

const isPositiveInt = (v: unknown): boolean => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const isProbability = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const isJudgeMode = (v: unknown): v is JudgeMode => v === "enforce" || v === "shadow";

function section(config: unknown, key: string): Record<string, unknown> {
  const value = config !== null && typeof config === "object" ? (config as Record<string, unknown>)[key] : undefined;
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Problems with a config (for overrides passed to createEngine); [] when valid. Never throws. */
export function validateEngineConfig(config: unknown): readonly string[] {
  const s = (key: string) => section(config, key);
  const judge = s("judge");
  const mode = config !== null && typeof config === "object" ? (config as Record<string, unknown>)["judge_mode"] : undefined;
  const checks: readonly Check[] = [
    ["judge_mode", isJudgeMode(mode)],
    ["rail.ceiling_minor", isPositiveInt(s("rail")["ceiling_minor"])],
    ["rail.max_active_cards", isPositiveInt(s("rail")["max_active_cards"])],
    ["card.ttl_ms", isPositiveInt(s("card")["ttl_ms"])],
    ["escalation.window_ms", isPositiveInt(s("escalation")["window_ms"])],
    ["velocity.max_mints", isPositiveInt(s("velocity")["max_mints"])],
    ["velocity.window_s", isPositiveInt(s("velocity")["window_s"])],
    ["seller.max_capture_age_s", isPositiveInt(s("seller")["max_capture_age_s"])],
    ["timeouts.planner_ms", isPositiveInt(s("timeouts")["planner_ms"])],
    ["timeouts.judge_ms", isPositiveInt(s("timeouts")["judge_ms"])],
    ["latency.decision_p95_ms", isPositiveInt(s("latency")["decision_p95_ms"])],
    ...(["t_inj", "t_sell_deny", "t_sell_esc", "t_scope", "t_esc"] as const).map(
      (k): Check => [`judge.${k}`, isProbability(judge[k])],
    ),
    ["judge.t_sell_esc <= judge.t_sell_deny", Number(judge["t_sell_esc"]) <= Number(judge["t_sell_deny"])],
  ];
  return checks.filter(([, ok]) => !ok).map(([path]) => `invalid ${path}`);
}
