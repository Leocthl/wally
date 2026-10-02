// Audit (lane s-audit): the judge record decides its own effect. `shadow: true` inside the record turns every
// R10 result into SKIPPED, including R10.unavailable (judge down, I5) and the R10.injection DENY, so a record
// can move ESCALATE or DENY to APPROVE (I3). The record comes from the agent package's adapter, and the
// adapter's default mode is shadow (packages/agent/test/security-judge-mode.test.ts).
import { describe, expect, it } from "vitest";
import { engine } from "../src/engine";
import type { JudgeRecord } from "../src/generated";
import { CART_A1, JUDGE_INJECTED, M0, PACKET_INITIAL, PROOF_OK, at } from "./engine-helpers";

const NOW = at("2026-10-03T02:05:00Z");
const DOWN: JudgeRecord = { provider: "laya", model: "typed-decisions", version: "x", status: "ERROR", latency_ms: 1500, shadow: false };
const decide = (judge: JudgeRecord) => engine.decide(M0, PACKET_INITIAL, CART_A1, judge, NOW, undefined, PROOF_OK);

const ENFORCED_DOWN = decide(DOWN);
const SHADOW_DOWN = decide({ ...DOWN, shadow: true });
const ENFORCED_INJECTED = decide(JUDGE_INJECTED);
const SHADOW_INJECTED = decide({ ...JUDGE_INJECTED, shadow: true });

describe("controls (enforce)", () => {
  it("judge down => ESCALATE R10.unavailable; injection => DENY R10.injection", () => {
    expect(ENFORCED_DOWN).toMatchObject({ outcome: "ESCALATE", explanation: { template_id: "R10.unavailable" } });
    expect(ENFORCED_INJECTED).toMatchObject({ outcome: "DENY", explanation: { template_id: "R10.injection" } });
  });
});

// FIXED (lane e-orch): the mode is EngineConfig.judge_mode (pinned in config_sha256, default "enforce"); the
// record's own `shadow` flag is informational and can no longer switch R10 off.
describe("S-JUDGE-1 (fixed): a shadow judge record cannot loosen ESCALATE and DENY to APPROVE (I3, I5)", () => {
  it("a judge that is down still escalates when its record says shadow", () => {
    expect(SHADOW_DOWN.outcome).not.toBe("APPROVE");
  });

  it("an injection verdict still denies when its record says shadow", () => {
    expect(SHADOW_INJECTED.outcome).not.toBe("APPROVE");
  });
});
