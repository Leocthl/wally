import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG, THRESHOLD_REFS, validateEngineConfig, type EngineConfig } from "../src/config";

describe("@wally/core/config", () => {
  it("pins every threshold, window and limit to its facts-register row", () => {
    expect(ENGINE_CONFIG.rail).toEqual({ ceiling_minor: 200_000, max_active_cards: 2 }); // F1
    expect(ENGINE_CONFIG.card.ttl_ms).toBe(30 * 60 * 1000); // F30
    expect(ENGINE_CONFIG.escalation.window_ms).toBe(60 * 1000); // F31
    expect(ENGINE_CONFIG.velocity).toEqual({ max_mints: 3, window_s: 600 }); // F32
    expect(ENGINE_CONFIG.timeouts).toEqual({ planner_ms: 20_000, judge_ms: 1_500 }); // F33, F34
    expect(ENGINE_CONFIG.latency.decision_p95_ms).toBe(3_000); // F35
    expect(ENGINE_CONFIG.judge).toEqual({ t_inj: 0.39, t_sell_deny: 0.86, t_sell_esc: 0.85, t_scope: 0.63, t_esc: 0.5 }); // F36, F50
    expect(ENGINE_CONFIG.seller.max_capture_age_s).toBe(86_400); // F52
  });

  it("is deeply frozen", () => {
    expect(Object.isFrozen(ENGINE_CONFIG)).toBe(true);
    for (const section of Object.values(ENGINE_CONFIG)) expect(Object.isFrozen(section)).toBe(true);
    expect(() => {
      (ENGINE_CONFIG.judge as { t_inj: number }).t_inj = 0.99;
    }).toThrow(TypeError);
    expect(ENGINE_CONFIG.judge.t_inj).toBe(0.39);
  });

  it("names threshold refs the decision schema accepts", () => {
    const pattern = /^(F[0-9]{1,3}[a-z]?(\.[A-Za-z_]+)?|mandate\.[a-z_.]+|packet\.[a-z_]+)$/;
    for (const ref of Object.values(THRESHOLD_REFS)) expect(ref).toMatch(pattern);
    expect(THRESHOLD_REFS.t_inj).toBe("F36.T_inj");
    expect(THRESHOLD_REFS.t_esc).toBe("F50.T_esc");
  });

  it("accepts the default config", () => {
    expect(validateEngineConfig(ENGINE_CONFIG)).toEqual([]);
  });

  it("rejects out-of-range or inconsistent overrides", () => {
    const bad = (patch: (c: EngineConfig) => unknown): EngineConfig =>
      patch(structuredClone(ENGINE_CONFIG) as EngineConfig) as EngineConfig;
    const withJudge = (judge: Partial<EngineConfig["judge"]>) =>
      bad((c) => ({ ...c, judge: { ...c.judge, ...judge } }));
    expect(validateEngineConfig(withJudge({ t_inj: 1.5 }))).not.toEqual([]);
    expect(validateEngineConfig(withJudge({ t_scope: Number.NaN }))).not.toEqual([]);
    expect(validateEngineConfig(withJudge({ t_sell_esc: 0.6, t_sell_deny: 0.5 }))).not.toEqual([]);
    expect(validateEngineConfig(bad((c) => ({ ...c, rail: { ...c.rail, ceiling_minor: 12.5 } })))).not.toEqual([]);
    expect(validateEngineConfig(bad((c) => ({ ...c, velocity: { ...c.velocity, max_mints: 0 } })))).not.toEqual([]);
    expect(validateEngineConfig(bad((c) => ({ ...c, escalation: { window_ms: -1 } })))).not.toEqual([]);
    expect(validateEngineConfig(null)).not.toEqual([]);
  });
});
