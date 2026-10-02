// B1 and the path both baselines share (mint, checkout, R12, replay, revoke). B2 runs through the orchestrator and has its own
// file (b2.test.ts); B1 runs through the harness's own small pipeline, so these tests are about that pipeline and its policy.
import { describe, expect, it } from "vitest";
import { engine } from "@laisee/core/engine";
import { createExecutor } from "@laisee/core/executor";
import { MintError, type RailPort } from "@laisee/core/ports";
import { MerchantStub } from "@laisee/rail-sim";
import { createComponents } from "../src/factory";
import { labelAgreement } from "../src/metrics/agreement";
import { createB1Gate } from "../src/systems/b1";
import { governedWorlds } from "../src/worlds/governed";
import { pick, scenarios, system, systems } from "./support/rig";
import { SWEEP_MS } from "./support/timeouts";

const B1 = system("B1");

describe("B1 on the fixed seed set, real engine, rail, merchant and executor", () => {
  it("never mints above the allowed limit and never charges above it (D-28, I2)", async () => {
    for (const s of scenarios) {
      const out = await B1.run(s);
      for (const m of out.mints) expect(m.limitMinor, s.id).toBeLessThanOrEqual(s.limits.allowedMinor);
      expect(out.authorisedMinor, s.id).toBeLessThanOrEqual(s.limits.allowedMinor);
    }
  }, SWEEP_MS);

  it("agrees with the label everywhere the judge or the seller check is not what stops the cart, and where a repeated cart is not the point", async () => {
    const misses: string[] = [];
    for (const s of scenarios) {
      const needsJudge = s.label.rule === "R10" || s.label.rule === "R9" || s.category === "padded_listing";
      if (needsJudge || s.category === "duplicate") continue;
      const a = labelAgreement(s, await B1.run(s));
      if (!a.all) misses.push(`${s.id} ${s.variant}: ${a.reason}`);
    }
    expect(misses).toEqual([]);
  }, SWEEP_MS);

  it("has no judge and no seller check: it approves injected and flagged carts that pass R1-R8, and the rail mints them", async () => {
    for (const s of [pick("injected_text", "inj_clean_cart"), pick("flagged_seller", "flagged")]) {
      const out = await B1.run(s);
      expect(out.judge, s.id).toBeNull();
      expect(out.decision.outcome, s.id).toBe("APPROVE");
      expect(out.mintBlocked, `${s.id}: the rail must not refuse B1's approval`).toBeNull();
      expect(out.mints, s.id).toHaveLength(1);
      expect(out.authorisedCount, s.id).toBe(1);
    }
  });

  it("hands the rail an APPROVE that carries no FAIL rule: R9 and R10 are SKIPPED, not failed, and the id is B1's own", async () => {
    const components = createComponents();
    const gate = createB1Gate({ components });
    for (const s of [pick("flagged_seller", "flagged"), pick("flagged_seller", "stale_capture"), pick("injected_text", "inj_clean_cart")]) {
      const world = await components.governed(s);
      const made = await gate.decide(s, world, 0);
      const approved = made.forRail;
      if (approved === null) throw new Error(`${s.id}: B1 should approve it`);
      expect(approved.rules.filter((r) => r.result === "FAIL"), s.id).toEqual([]);
      expect(approved.rules.filter((r) => r.id === "R9" || r.id === "R10").every((r) => r.result === "SKIPPED"), s.id).toBe(true);
      expect(made.entry, "what is logged is what the rail gets").toBe(approved);
      expect(made.facts.decisionId).toBe(approved.id);
    }
  });

  it("keeps the engine's own decision when B1 stops: the stop reason is a rule it evaluates", async () => {
    const components = createComponents();
    const gate = createB1Gate({ components });
    const s = pick("shipping_overflow", "over_remaining_clear");
    const made = await gate.decide(s, await components.governed(s), 0);
    expect(made.forRail).toBeNull();
    expect(made.facts).toMatchObject({ outcome: "DENY", rule: "R3", templateId: "R3.over_remaining" });
  });

  it("has no path to ask the shopper: an ESCALATE is a stop", async () => {
    const asked = await B1.run(pick("shipping_overflow", "over_ask_above"));
    expect(asked.decision.outcome).toBe("ESCALATE");
    expect(asked.escalations).toEqual([]);
    expect(asked.mints).toHaveLength(0);
  });
});

describe("what the baseline pipeline does after a decision", () => {
  it("duplicate: a repeated cart is a second decision and a second card, as the orchestrator treats it today", async () => {
    const out = await B1.run(pick("duplicate", "double_submit"));
    expect(out.decision.decisionIds).toHaveLength(2);
    expect(out.mints).toHaveLength(2);
    expect(out.authorisedCount).toBe(2);
  });

  it("rail_timeout: the retry reuses the idempotency key and the rail charges once", async () => {
    const s = pick("rail_timeout", "timeout_retry");
    const out = await B1.run(s);
    expect(out.authorisedCount).toBe(1);
    expect(out.authorisedMinor).toBe(s.cart.total_minor);
  });

  it("replay: the second charge on the used token declines CARD_USED", async () => {
    const out = await B1.run(pick("replay", "replay_same"));
    expect(out.authorisedCount).toBe(1);
    expect(out.events.some((e) => e.event === "DECLINED" && e.declineCode === "CARD_USED")).toBe(true);
  });

  it("wrong_merchant: MERCHANT_MISMATCH and no money moves", async () => {
    const out = await B1.run(pick("wrong_merchant", "wrong_domain"));
    expect(out.authorisedCount).toBe(0);
    expect(out.events.some((e) => e.declineCode === "MERCHANT_MISMATCH")).toBe(true);
  });

  it("price_drift: the re-quote voids the approval (R12) and the card, no charge", async () => {
    const out = await B1.run(pick("price_drift", "drift_up"));
    expect(out.r12Void).toBe(true);
    expect(out.events.some((e) => e.event === "VOIDED")).toBe(true);
    expect(out.authorisedCount).toBe(0);
  });

  it("overshoot: the card limit holds and the rail declines OVER_LIMIT", async () => {
    const out = await B1.run(pick("price_drift", "overshoot"));
    expect(out.authorisedCount).toBe(0);
    expect(out.events.some((e) => e.declineCode === "OVER_LIMIT")).toBe(true);
  });

  it("revoke after the mint voids the card and the later charge declines CARD_VOIDED", async () => {
    const out = await B1.run(pick("revoked", "revoked_after_mint"));
    expect(out.events.some((e) => e.event === "VOIDED")).toBe(true);
    expect(out.events.some((e) => e.declineCode === "CARD_VOIDED")).toBe(true);
    expect(out.authorisedCount).toBe(0);
  });

  it("revoke after first use changes nothing: a used card is final [F2]", async () => {
    const out = await B1.run(pick("revoked", "revoked_after_use"));
    expect(out.authorisedCount).toBe(1);
  });
});

describe("fail closed (I5), B1", () => {
  const clean = pick("within_budget", "plain");

  it("an engine that throws is a DENY with the error recorded, and mints nothing", async () => {
    const throwing = { ...engine, decide: () => { throw new Error("engine bug"); } };
    const out = await system("B1", { components: createComponents({ engine: throwing }) }).run(clean);
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
    const refusingWorlds = governedWorlds({ createRail: () => refusing, createMerchant: (rail) => new MerchantStub({ rail }), createExecutor });
    const out = await system("B1", { components: createComponents({ governed: refusingWorlds }) }).run(clean);
    expect(out.mintBlocked).toBe("OVER_CEILING");
    expect(out.authorisedCount).toBe(0);
  });
});

describe("outcome record", () => {
  it("names its baseline, keeps latency only when asked, and is plain data", async () => {
    const s = pick("within_budget", "plain");
    const withLatency = await B1.run(s);
    expect(withLatency.baseline).toBe("B1");
    expect(withLatency.latencyMs).not.toBeNull();
    const off = systems({ measureLatency: false }).find((x) => x.id === "B1");
    expect((await off?.run(s))?.latencyMs).toBeNull();
    expect(JSON.parse(JSON.stringify(withLatency))).toEqual(withLatency);
  });
});
