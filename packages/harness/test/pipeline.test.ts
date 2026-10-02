import { describe, expect, it } from "vitest";
import { MintError, type Engine, type JudgePort, type RailPort } from "@laisee/core/ports";
import { FakeJudge } from "@laisee/core/testing";
import { createComponents } from "../src/factory";
import { generateScenarios } from "../src/scenario/generate";
import { createSystems } from "../src/systems/create";
import { labelAgreement } from "../src/metrics/agreement";
import type { Baseline, Scenario } from "../src/types";
import { SCENARIO_COUNT } from "../src/config";
import { engineUnderTest } from "./support/engine-under-test";
import { downJudge, keywordJudge } from "./support/keyword-model";

const { engine, kind } = engineUnderTest();
const judgeFor = (s: Scenario): JudgePort => (s.events.judgeFault === "down" ? downJudge() : keywordJudge());
let tick = 0;
const timer = (): number => (tick += 3);

function systems(over: { engine?: Engine; judgeFor?: (s: Scenario) => JudgePort; createRail?: () => RailPort } = {}) {
  const base = createComponents({ engine: over.engine ?? engine });
  const components = over.createRail ? { ...base, createRail: over.createRail } : base;
  return createSystems({ components, judgeFor: over.judgeFor ?? judgeFor, choiceFor: () => { throw new Error("B0 not used in this test"); }, timer, measureLatency: true });
}

const [, B1, B2] = (() => {
  const all = systems();
  return [all.find((s) => s.id === "B0"), all.find((s) => s.id === "B1"), all.find((s) => s.id === "B2")];
})();

const scenarios = [7, 11, 2026].flatMap((seed) => generateScenarios({ seed, n: SCENARIO_COUNT.default }));
const pick = (category: string, variant: string): Scenario => {
  const s = scenarios.find((x) => x.category === category && x.variant === variant);
  if (!s) throw new Error(`no ${category}/${variant} scenario in the fixed seed set`);
  return s;
};

describe(`B1 and B2 on the fixed seed set (engine: ${kind})`, () => {
  it("never mint above the allowed limit and never charge above it (D-28, I2)", async () => {
    for (const system of [B1, B2]) {
      for (const s of scenarios) {
        const out = await system!.run(s);
        for (const m of out.mints) expect(m.limitMinor, `${system!.id} ${s.id}`).toBeLessThanOrEqual(s.limits.allowedMinor);
        expect(out.authorisedMinor, `${system!.id} ${s.id}`).toBeLessThanOrEqual(s.limits.allowedMinor);
      }
    }
  });

  it("B2 agrees with every label when the judge answers as the labels assume", async () => {
    const misses: string[] = [];
    for (const s of scenarios) {
      const out = await B2!.run(s);
      const a = labelAgreement(s, out);
      if (!a.all) misses.push(`${s.id} ${s.variant}: ${a.reason}`);
    }
    expect(misses).toEqual([]);
  });

  it("B1 agrees with the label everywhere the judge is not what stops the cart", async () => {
    const misses: string[] = [];
    for (const s of scenarios) {
      const judgeOnly = s.label.rule === "R10" || s.label.rule === "R9" || s.category === "padded_listing";
      if (judgeOnly) continue;
      const a = labelAgreement(s, await B1!.run(s));
      if (!a.all) misses.push(`${s.id} ${s.variant}: ${a.reason}`);
    }
    expect(misses).toEqual([]);
  });

  it("B1 has no judge and no seller check: it approves injected and flagged carts that pass R1-R8", async () => {
    const injected = pick("injected_text", "inj_clean_cart");
    const flagged = pick("flagged_seller", "flagged");
    for (const s of [injected, flagged]) {
      const out = await B1!.run(s);
      expect(out.judge, s.id).toBeNull();
      expect(out.decision.outcome, s.id).toBe("APPROVE");
    }
  });
});

describe("pipeline behaviour by category", () => {
  it("duplicate: the repeat returns the earlier decision, one mint, one charge", async () => {
    const out = await B2!.run(pick("duplicate", "double_submit"));
    expect(out.decision.decisionIds).toHaveLength(1);
    expect(out.mints).toHaveLength(1);
    expect(out.authorisedCount).toBe(1);
  });

  it("rail_timeout: the retry reuses the idempotency key and the rail charges once", async () => {
    const s = pick("rail_timeout", "timeout_retry");
    const out = await B2!.run(s);
    expect(out.authorisedCount).toBe(1);
    expect(out.authorisedMinor).toBe(s.cart.total_minor);
  });

  it("replay: the second charge on the used token declines CARD_USED", async () => {
    const out = await B2!.run(pick("replay", "replay_same"));
    expect(out.authorisedCount).toBe(1);
    expect(out.events.some((e) => e.event === "DECLINED" && e.declineCode === "CARD_USED")).toBe(true);
  });

  it("wrong_merchant: MERCHANT_MISMATCH and no money moves", async () => {
    const out = await B2!.run(pick("wrong_merchant", "wrong_domain"));
    expect(out.authorisedCount).toBe(0);
    expect(out.events.some((e) => e.declineCode === "MERCHANT_MISMATCH")).toBe(true);
  });

  it("price_drift: the re-quote voids the approval (R12) and the card, no charge", async () => {
    const out = await B2!.run(pick("price_drift", "drift_up"));
    expect(out.r12Void).toBe(true);
    expect(out.events.some((e) => e.event === "VOIDED")).toBe(true);
    expect(out.authorisedCount).toBe(0);
  });

  it("overshoot: the card limit holds and the rail declines OVER_LIMIT", async () => {
    const out = await B2!.run(pick("price_drift", "overshoot"));
    expect(out.authorisedCount).toBe(0);
    expect(out.events.some((e) => e.declineCode === "OVER_LIMIT")).toBe(true);
  });

  it("revoke after the mint voids the card and the later charge declines CARD_VOIDED", async () => {
    const out = await B2!.run(pick("revoked", "revoked_after_mint"));
    expect(out.events.some((e) => e.event === "VOIDED")).toBe(true);
    expect(out.events.some((e) => e.declineCode === "CARD_VOIDED")).toBe(true);
    expect(out.authorisedCount).toBe(0);
  });

  it("revoke after first use changes nothing: a used card is final [F2]", async () => {
    const out = await B2!.run(pick("revoked", "revoked_after_use"));
    expect(out.authorisedCount).toBe(1);
  });

  it("judge_down: ESCALATE and no card (I5)", async () => {
    const out = await B2!.run(pick("judge_down", "judge_down"));
    expect(out.judge?.status).not.toBe("OK");
    expect(out.decision.outcome).not.toBe("APPROVE");
    expect(out.mints).toHaveLength(0);
  });

  it("padded_listing: truncated input is an ERROR, never an APPROVE (F26)", async () => {
    const out = await B2!.run(pick("padded_listing", "padded_injection_tail"));
    expect(out.judge?.inputTruncated).toBe(true);
    expect(out.decision.outcome).not.toBe("APPROVE");
    expect(out.mints).toHaveLength(0);
  });
});

describe("fail closed (I5)", () => {
  const clean = pick("within_budget", "plain");

  it("an engine that throws is a DENY with the error recorded, and mints nothing", async () => {
    const throwing: Engine = { decide: () => { throw new Error("engine bug"); } };
    const out = await systems({ engine: throwing }).find((s) => s.id === "B2")!.run(clean);
    expect(out.decision.outcome).toBe("DENY");
    expect(out.error).toContain("engine bug");
    expect(out.mints).toHaveLength(0);
  });

  it("a rail that refuses the mint leaves no card and no charge", async () => {
    const refusing: RailPort = {
      mint: async () => { throw new MintError("OVER_CEILING"); },
      authorise: async () => { throw new Error("must not be called"); },
      void: async () => { throw new Error("must not be called"); },
      expireDue: async () => [],
    };
    const out = await systems({ createRail: () => refusing }).find((s) => s.id === "B2")!.run(clean);
    expect(out.mintBlocked).toBe("OVER_CEILING");
    expect(out.authorisedCount).toBe(0);
  });

  it("a judge that returns a TIMEOUT escalates", async () => {
    const slow: JudgePort = new FakeJudge({ status: "TIMEOUT" });
    const out = await systems({ judgeFor: () => slow }).find((s) => s.id === "B2")!.run(clean);
    expect(out.judge?.status).toBe("TIMEOUT");
    expect(out.decision.outcome).toBe("ESCALATE");
  });
});

describe("outcome record", () => {
  it("names its baseline, keeps latency only when asked, and is plain data", async () => {
    const s = pick("within_budget", "plain");
    const withLatency = await B2!.run(s);
    expect(withLatency.baseline satisfies Baseline).toBe("B2");
    expect(withLatency.latencyMs).not.toBeNull();
    const off = createSystems({ components: createComponents({ engine }), judgeFor, choiceFor: () => { throw new Error("unused"); }, timer, measureLatency: false });
    expect((await off.find((x) => x.id === "B2")!.run(s)).latencyMs).toBeNull();
    expect(JSON.parse(JSON.stringify(withLatency))).toEqual(withLatency);
  });
});
