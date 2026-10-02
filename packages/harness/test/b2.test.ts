// B2 is the real orchestrator: the recorded planner, core's cart builder, the judge, the engine, the rail and the executor
// over a signed log, with the scenario's history written into that log. A keyword judge answers as the labels assume, so
// these tests are about the wiring, the labels and the product's behaviour, not about how well Laya reads a listing.
import { describe, expect, it } from "vitest";
import { createReplayPlanner } from "@laisee/agent/planner";
import { engine } from "@laisee/core/engine";
import { createOrchestrator } from "@laisee/core/orchestrator";
import { MintError, type JudgePort, type RailPort } from "@laisee/core/ports";
import { FakeJudge, FakePlanner } from "@laisee/core/testing";
import { MerchantStub, RailSim, seededRandom } from "@laisee/rail-sim";
import { createComponents } from "../src/factory";
import { labelAgreement } from "../src/metrics/agreement";
import { CATEGORY_VARIANTS, generateScenarios } from "../src/scenario/generate";
import type { Scenario } from "../src/types";
import { orchestratedWorlds } from "../src/worlds/orchestrated";
import { pick, scenarios, system, systems } from "./support/rig";
import { RUN_MS, SWEEP_MS } from "./support/timeouts";

const B2 = system("B2");

async function disagreements(list: readonly Scenario[]): Promise<readonly Scenario[]> {
  const out: Scenario[] = [];
  for (const s of list) if (!labelAgreement(s, await B2.run(s)).all) out.push(s);
  return out;
}

describe("B2 on the fixed seed set", () => {
  it("never mints above the allowed limit and never charges above it (D-28, I2)", async () => {
    for (const s of scenarios) {
      const out = await B2.run(s);
      for (const m of out.mints) expect(m.limitMinor, s.id).toBeLessThanOrEqual(s.limits.allowedMinor);
      expect(out.authorisedMinor, s.id).toBeLessThanOrEqual(s.limits.allowedMinor);
    }
  }, SWEEP_MS);

  it("agrees with every label when the judge answers as the labels assume, a repeated cart included", async () => {
    const off = await disagreements(scenarios);
    expect(off.map((s) => `${s.id} ${s.variant}`)).toEqual([]);
  }, SWEEP_MS);

  it("leaves a log that verifies offline, with one DECISION entry per decision (I7)", async () => {
    for (const s of scenarios.slice(0, 120)) {
      const out = await B2.run(s);
      expect(out.log?.chainOk, `${s.id}: ${out.log?.failure ?? "no audit"}`).toBe(true);
      expect(out.log?.decisions, s.id).toBeGreaterThanOrEqual(out.decision.decisionIds.length);
    }
  }, SWEEP_MS);
});

describe("label sweep: B2 agrees with every label across many seeds, so no rare parameter mix is mislabelled", () => {
  it("holds for seeds 100 to 111, and the sweep reaches every variant", async () => {
    const misses: string[] = [];
    const seen = new Set<string>();
    for (let seed = 100; seed < 112; seed += 1) {
      for (const s of generateScenarios({ seed, n: 100 })) {
        seen.add(`${s.category}/${s.variant}`);
        const a = labelAgreement(s, await B2.run(s));
        if (!a.all) misses.push(`seed ${seed} ${s.id} ${s.variant}: ${a.reason}`);
      }
    }
    expect(misses).toEqual([]);
    const every = Object.entries(CATEGORY_VARIANTS).flatMap(([category, variants]) => variants.map((v) => `${category}/${v.name}`));
    expect(every.filter((v) => !seen.has(v))).toEqual([]);
  }, SWEEP_MS);
});

describe("what the orchestrator does after a decision", () => {
  it("duplicate: a repeated small cart returns the earlier decision, so one decision, one card and one charge (docs/02 section 6)", async () => {
    const out = await B2.run(pick("duplicate", "double_submit"));
    expect(out.decision.decisionIds).toHaveLength(1);
    expect(out.mints).toHaveLength(1);
    expect(out.authorisedCount).toBe(1);
  });

  it("duplicate: a repeated large cart returns the earlier decision too, so one card and one charge", async () => {
    const out = await B2.run(pick("duplicate", "double_submit_large"));
    expect(out.decision.decisionIds).toHaveLength(1);
    expect(out.mints).toHaveLength(1);
    expect(out.authorisedCount).toBe(1);
  });

  it("rail_timeout: the retry reuses the idempotency key and the rail charges once", async () => {
    const s = pick("rail_timeout", "timeout_retry");
    const out = await B2.run(s);
    expect(out.authorisedCount).toBe(1);
    expect(out.authorisedMinor).toBe(s.cart.total_minor);
  });

  it("replay: the second charge on the used token declines CARD_USED", async () => {
    const out = await B2.run(pick("replay", "replay_same"));
    expect(out.authorisedCount).toBe(1);
    expect(out.events.some((e) => e.event === "DECLINED" && e.declineCode === "CARD_USED")).toBe(true);
  });

  it("wrong_merchant: MERCHANT_MISMATCH and no money moves", async () => {
    const out = await B2.run(pick("wrong_merchant", "wrong_domain"));
    expect(out.authorisedCount).toBe(0);
    expect(out.events.some((e) => e.declineCode === "MERCHANT_MISMATCH")).toBe(true);
  });

  it("price_drift: the re-quote voids the approval (R12) and the card, and nothing is presented", async () => {
    const out = await B2.run(pick("price_drift", "drift_up"));
    expect(out.r12Void).toBe(true);
    expect(out.events.some((e) => e.event === "VOIDED")).toBe(true);
    expect(out.authorisedCount).toBe(0);
  });

  it("overshoot: the card limit holds and the rail declines OVER_LIMIT", async () => {
    const out = await B2.run(pick("price_drift", "overshoot"));
    expect(out.authorisedCount).toBe(0);
    expect(out.events.some((e) => e.declineCode === "OVER_LIMIT")).toBe(true);
  });

  it("revoke after the mint voids the card, and the checkout is refused by R2 before anything is presented", async () => {
    const out = await B2.run(pick("revoked", "revoked_after_mint"));
    expect(out.events.filter((e) => e.event === "VOIDED")).toHaveLength(1);
    expect(out.events.some((e) => e.declineCode === "CARD_VOIDED"), "the card was never presented, so the rail declined nothing").toBe(false);
    expect(out.authorisedCount).toBe(0);
    expect(out.log?.decisions).toBe(2); // the approval and the checkout-time denial that resolves it
  });

  it("revoke after first use changes nothing: a used card is final [F2]", async () => {
    const out = await B2.run(pick("revoked", "revoked_after_use"));
    expect(out.authorisedCount).toBe(1);
  });

  it("padded_listing: truncated input is an ERROR, never an APPROVE (F26)", async () => {
    const s = pick("padded_listing", "padded_injection_tail");
    const out = await system("B2", { judgeFor: () => new FakeJudge({ inputTruncated: true }) }).run(s);
    expect(out.judge?.inputTruncated).toBe(true);
    expect(out.decision.outcome).toBe("ESCALATE");
    expect(out.mints).toHaveLength(0); // the shopper is asked and a stop case gets a no
  });
});

describe("the simulated shopper answers what the engine escalates", () => {
  it("says no to a purchase the label must stop: an ask_above escalation ends with no card", async () => {
    const out = await B2.run(pick("shipping_overflow", "over_ask_above"));
    expect(out.decision.outcome).toBe("ESCALATE");
    expect(out.escalations).toEqual([{ answer: "DENY", resolvedTo: "DENY" }]);
    expect(out.mints).toHaveLength(0);
    expect(out.completed).toBe(false);
  });

  it("says yes to a purchase the label wants: a judge that doubts a legitimate cart costs a question, not the purchase", async () => {
    const doubting: JudgePort = new FakeJudge({ answers: { scope_fit: { in_scope: 0.2, out_of_scope: 0.8 } } });
    const s = pick("within_budget", "plain");
    const out = await system("B2", { judgeFor: () => doubting }).run(s);
    expect(out.decision.outcome).toBe("ESCALATE"); // R10.scope
    expect(out.escalations).toEqual([{ answer: "APPROVE", resolvedTo: "APPROVE" }]);
    expect(out.completed).toBe(true);
    expect(out.authorisedMinor).toBe(s.cart.total_minor);
  });

  it("does not ask about a hard DENY: no answer can clear a rule that is not answerable", async () => {
    const out = await B2.run(pick("shipping_overflow", "over_remaining_clear"));
    expect(out.decision.outcome).toBe("DENY");
    expect(out.escalations).toEqual([]);
  });

  it("a judge that timed out is recorded as a TIMEOUT, and a legitimate purchase then completes only after the shopper says yes", async () => {
    const slow: JudgePort = new FakeJudge({ status: "TIMEOUT" });
    const out = await system("B2", { judgeFor: () => slow }).run(pick("within_budget", "plain"));
    expect(out.judge?.status).toBe("TIMEOUT");
    expect(out.decision.outcome).toBe("ESCALATE");
    expect(out.escalations).toEqual([{ answer: "APPROVE", resolvedTo: "APPROVE" }]);
  });

  it("an injected judge outage is an ESCALATE for a stop case, answered no: no card (I5)", async () => {
    const out = await B2.run(pick("judge_down", "judge_down"));
    expect(out.judge?.status).not.toBe("OK");
    expect(out.decision.outcome).toBe("ESCALATE");
    expect(out.mints).toHaveLength(0);
  });
});

describe("fail closed (I5), B2", () => {
  const clean = pick("within_budget", "plain");
  const worldWith = (over: Partial<Parameters<typeof orchestratedWorlds>[0]>) =>
    orchestratedWorlds({
      engine,
      createRail: () => new RailSim({ random: seededRandom(5) }),
      createMerchant: (rail) => new MerchantStub({ rail }),
      createOrchestrator,
      createPlanner: (s) => createReplayPlanner({ records: [s.planner], catalogue: [s.listing], scenario: s.planner.scenario }),
      ...over,
    });

  it("an engine that throws is a stop with the error recorded, and mints nothing", async () => {
    const throwing = { ...engine, decide: () => { throw new Error("engine bug"); } };
    const out = await system("B2", { components: createComponents({ engine: throwing }) }).run(clean);
    expect(out.error).toContain("ENGINE_FAILED");
    expect(out.mints).toHaveLength(0);
    expect(out.completed).toBe(false);
  });

  it("a rail that refuses the mint leaves no card and no charge, and the refusal is reported as the rail's", async () => {
    const refusing: RailPort = {
      mint: async () => { throw new MintError("OVER_CEILING"); },
      authorise: async () => { throw new Error("must not be called"); },
      void: async () => { throw new Error("must not be called"); },
      expireDue: async () => [],
    };
    const orchestrated = worldWith({ createRail: () => refusing });
    const out = await system("B2", { components: createComponents({ orchestrated }) }).run(clean);
    expect(out.mintBlocked).toBe("OVER_CEILING");
    expect(out.authorisedCount).toBe(0);
    expect(out.error).toBeNull();
  });

  it("a planner with no proposal makes no cart and no decision, and the reason is reported", async () => {
    const orchestrated = worldWith({ createPlanner: () => new FakePlanner([null]) });
    const out = await system("B2", { components: createComponents({ orchestrated }) }).run(clean);
    expect(out.error).toBe("NO_PROPOSAL: planner_null");
    expect(out.decision.decisionIds).toEqual([]);
    expect(out.mints).toHaveLength(0);
  });

  it("a world that cannot be built is a stop, not a crash", async () => {
    const orchestrated = async () => { throw new Error("no world today"); };
    const out = await system("B2", { components: createComponents({ orchestrated }) }).run(clean);
    expect(out.error).toContain("world setup failed: no world today");
    expect(out.completed).toBe(false);
  });
});

describe("latency is a measurement of real calls only [F26]", () => {
  it("an injected judge outage is not a latency sample: nothing was called", async () => {
    const down = await B2.run(pick("judge_down", "judge_down"));
    const up = await B2.run(pick("judge_down", "judge_up"));
    expect(down.latencyMs).toBeNull();
    expect(up.latencyMs).not.toBeNull();
  });
});

describe("outcome record", () => {
  it("names its baseline, keeps latency only when asked, and is plain data", async () => {
    const s = pick("within_budget", "plain");
    const withLatency = await B2.run(s);
    expect(withLatency.baseline).toBe("B2");
    expect(withLatency.latencyMs).not.toBeNull();
    const off = systems({ measureLatency: false }).find((x) => x.id === "B2");
    expect((await off?.run(s))?.latencyMs).toBeNull();
    expect(JSON.parse(JSON.stringify(withLatency))).toEqual(withLatency);
  }, RUN_MS);
});
