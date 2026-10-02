// Judge mode comes from the engine config, never from the judge record (audit S-JUDGE-1, I3, I5). In enforce
// mode (the default) a record that says `shadow: true` is still enforced; in shadow mode a usable reading is
// recorded as SKIPPED, but an unusable record (judge down, truncated input) still ESCALATEs R10.unavailable.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG, validateEngineConfig, type EngineConfig } from "../src/config";
import { configSha256, createEngine, engine } from "../src/engine";
import type { JudgeRecord } from "../src/generated";
import { evaluateR10 } from "../src/rules";
import { PROPERTY_SEED, judgeArb } from "./engine-arbitraries";
import { CART_A1, JUDGE_INJECTED, JUDGE_TEE, M0, PACKET_INITIAL, PROOF_OK, at } from "./engine-helpers";

const NOW = at("2026-10-03T02:05:00Z");
const SHADOW_CONFIG: EngineConfig = { ...ENGINE_CONFIG, judge_mode: "shadow" };
const shadowEngine = createEngine({ config: SHADOW_CONFIG });
const DOWN: JudgeRecord = { provider: "laya", model: "typed-decisions", version: "x", status: "ERROR", latency_ms: 1500, shadow: false };
const TRUNCATED: JudgeRecord = { ...DOWN, input_truncated: true };

describe("judge_mode in the engine config", () => {
  it("defaults to enforce, is validated, and is pinned in config_sha256", () => {
    expect(ENGINE_CONFIG.judge_mode).toBe("enforce");
    expect(engine.config.judge_mode).toBe("enforce");
    expect(validateEngineConfig(SHADOW_CONFIG)).toEqual([]);
    expect(validateEngineConfig({ ...ENGINE_CONFIG, judge_mode: "maybe" })).toEqual(["invalid judge_mode"]);
    expect(validateEngineConfig({ ...ENGINE_CONFIG, judge_mode: undefined })).toEqual(["invalid judge_mode"]);
    expect(configSha256(SHADOW_CONFIG)).not.toBe(configSha256(ENGINE_CONFIG));
    expect(() => createEngine({ config: { ...ENGINE_CONFIG, judge_mode: "off" } as unknown as EngineConfig })).toThrow(/judge_mode/);
  });
});

describe("enforce mode ignores the record's own shadow flag (S-JUDGE-1)", () => {
  const decide = (judge: JudgeRecord) => engine.decide(M0, PACKET_INITIAL, CART_A1, judge, NOW, undefined, PROOF_OK);

  it("a judge that is down still escalates when its record says shadow", () => {
    expect(decide({ ...DOWN, shadow: true })).toMatchObject({ outcome: "ESCALATE", explanation: { template_id: "R10.unavailable" } });
  });

  it("an injection verdict still denies when its record says shadow", () => {
    expect(decide({ ...JUDGE_INJECTED, shadow: true })).toMatchObject({ outcome: "DENY", explanation: { template_id: "R10.injection" } });
  });

  it("for any record, the shadow flag never changes the outcome", () => {
    fc.assert(
      fc.property(judgeArb, (judge) => {
        expect(decide({ ...judge, shadow: true }).outcome).toBe(decide({ ...judge, shadow: false }).outcome);
      }),
      { numRuns: 300, seed: PROPERTY_SEED },
    );
  }, 60_000);
});

describe("shadow mode (config) records a usable reading without effect, and still fails closed on an unusable one", () => {
  it("a usable reading is SKIPPED with the verdict it would have given", () => {
    const results = evaluateR10({ mandate: M0, judge: JUDGE_INJECTED, config: SHADOW_CONFIG });
    expect(results.every((r) => r.result === "SKIPPED")).toBe(true);
    expect(results.find((r) => r.check === "injection_risk")?.inputs).toMatchObject({ shadow: true, shadow_verdict: "DENY", shadow_template_id: "R10.injection" });
    expect(results.find((r) => r.check === "scope_fit")?.inputs).toMatchObject({ shadow_verdict: "PASS" });
    expect(shadowEngine.decide(M0, PACKET_INITIAL, CART_A1, JUDGE_INJECTED, NOW, undefined, PROOF_OK).outcome).toBe("APPROVE");
  });

  it.each([
    ["down", DOWN],
    ["truncated", TRUNCATED],
    ["timed out", { ...DOWN, status: "TIMEOUT" as const }],
  ])("a judge that is %s still ESCALATEs R10.unavailable", (_name, judge) => {
    expect(evaluateR10({ mandate: M0, judge, config: SHADOW_CONFIG })).toEqual([
      expect.objectContaining({ result: "FAIL", verdict: "ESCALATE", template_id: "R10.unavailable" }),
    ]);
    expect(shadowEngine.decide(M0, PACKET_INITIAL, CART_A1, judge, NOW, undefined, PROOF_OK)).toMatchObject({ outcome: "ESCALATE" });
  });

  it("the record's shadow flag is informational in shadow mode too", () => {
    const flagged = evaluateR10({ mandate: M0, judge: { ...JUDGE_TEE, shadow: true }, config: SHADOW_CONFIG });
    const unflagged = evaluateR10({ mandate: M0, judge: { ...JUDGE_TEE, shadow: false }, config: SHADOW_CONFIG });
    expect(flagged).toEqual(unflagged);
  });
});
