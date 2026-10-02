// Property tests (fast-check) for the engine: T-I2, T-I3, T-I5, T-I6, hard rules, explanations,
// determinism and schema validity of every Decision built from schema-valid input.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/config";
import { engine } from "../src/engine";
import type { Decision, JudgeRecord } from "../src/generated";
import { HARD_RULES } from "../src/rules";
import { validateDecision } from "../src/schema";
import { PROPERTY_SEED, brokenJudgeArb, cartArb, ctxArb, judgeArb, mandateArb, nowArb, packetArb, resolutionArb } from "./engine-arbitraries";
import { CLEAN_JUDGE, PROOF_OK } from "./engine-helpers";

const RANK: Readonly<Record<Decision["outcome"], number>> = { APPROVE: 0, ESCALATE: 1, DENY: 2 };
const RUNS = { numRuns: 400, seed: PROPERTY_SEED };

const scenario = fc.record({
  mandate: mandateArb,
  packet: packetArb,
  cart: cartArb,
  judge: judgeArb,
  now: nowArb,
  resolution: resolutionArb,
  ctx: ctxArb,
});

type Scenario = typeof scenario extends fc.Arbitrary<infer S> ? S : never;
const decide = (s: Scenario, judge: unknown = s.judge): Decision =>
  engine.decide(s.mandate, s.packet, s.cart, judge as JudgeRecord, s.now, s.resolution, s.ctx);

describe("engine invariants", () => {
  it("emits a schema-valid Decision for schema-valid input, and never throws", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const d = decide(s);
        const check = validateDecision(d);
        expect(check.ok, JSON.stringify(check)).toBe(true);
      }),
      RUNS,
    );
  });

  it("T-I3: no judge record can raise the outcome above a neutral judge", () => {
    fc.assert(
      fc.property(scenario, fc.oneof(judgeArb as fc.Arbitrary<unknown>, brokenJudgeArb), (s, judge) => {
        expect(RANK[decide(s, judge).outcome]).toBeGreaterThanOrEqual(RANK[decide(s, CLEAN_JUDGE).outcome]);
      }),
      RUNS,
    );
  });

  it("T-I5: an unusable judge record or a missing proof flag never approves (and never throws)", () => {
    fc.assert(
      fc.property(scenario, brokenJudgeArb, (s, judge) => {
        expect(decide({ ...s, resolution: undefined }, judge).outcome).not.toBe("APPROVE");
        expect(decide({ ...s, ctx: undefined }, judge).outcome).toBe("DENY");
      }),
      RUNS,
    );
  });

  it("T-I6: a revoked or expired mandate never approves, whatever the judge or the answer", () => {
    fc.assert(
      fc.property(scenario, fc.constantFrom("REVOKED", "EXPIRED") as fc.Arbitrary<"REVOKED" | "EXPIRED">, (s, status) => {
        expect(decide({ ...s, packet: { ...s.packet, status } }).outcome).toBe("DENY");
        const pastUntil = new Date(Date.parse(s.mandate.valid_until) + (s.now.getTime() % 1_000_000));
        expect(decide({ ...s, now: pastUntil }).outcome).toBe("DENY");
      }),
      RUNS,
    );
  });

  it("T-I2: APPROVE sets approved_limit = cart total <= min(remaining, rail ceiling [F1]) with R3 and R5 passing", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const d = decide({ ...s, ctx: PROOF_OK });
        if (d.outcome !== "APPROVE") {
          expect(d.approved_limit_minor).toBeUndefined();
          return;
        }
        expect(d.approved_limit_minor).toBe(s.cart.total_minor);
        expect(s.cart.total_minor).toBeLessThanOrEqual(Math.min(s.packet.remaining_minor, ENGINE_CONFIG.rail.ceiling_minor));
        expect(d.rules.find((r) => r.id === "R3")?.result).toBe("PASS");
        expect(d.rules.find((r) => r.id === "R5")?.result).toBe("PASS");
      }),
      RUNS,
    );
  });

  it("hard rules R1-R8 and R12 cannot be overridden by any answer (only R4 ask_above is answerable)", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const d = decide(s);
        const hardFails = d.rules.filter((r) => (HARD_RULES as readonly string[]).includes(r.id) && r.result === "FAIL");
        for (const r of hardFails) {
          if (r.verdict === "ESCALATE") expect(r.template_id).toBe("R4.ask_above");
          else expect(d.outcome).toBe("DENY");
        }
      }),
      RUNS,
    );
  });

  it("every DENY or ESCALATE cites a rule and template; the explanation is the first FAIL with that verdict", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const d = decide(s);
        for (const r of d.rules.filter((x) => x.result === "FAIL")) expect(r.template_id).toBeDefined();
        if (d.outcome === "APPROVE") {
          expect(d.rules.some((r) => r.result === "FAIL")).toBe(false);
          return;
        }
        const primary = d.rules.find((r) => r.result === "FAIL" && r.verdict === d.outcome);
        expect(d.explanation?.template_id).toBe(primary?.template_id);
        expect(d.explanation?.rendered).toMatch(/^(Stopped|Escalated) by R\d+\. /);
        if (d.outcome === "ESCALATE") expect(d.escalation?.state).toBe("OPEN");
      }),
      RUNS,
    );
  });

  it("is deterministic: identical inputs give byte-identical decisions", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        expect(JSON.stringify(decide(s))).toBe(JSON.stringify(decide(s)));
      }),
      { numRuns: 200, seed: PROPERTY_SEED },
    );
  });

  it("only an in-time answer from the delegator for that decision can approve a resolution", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        if (s.resolution === undefined) return;
        const d = decide(s);
        if (d.outcome !== "APPROVE") return;
        const a = s.resolution.answer;
        expect(a?.choice).toBe("APPROVE");
        expect(a?.signer).toBe(s.mandate.delegator);
        expect(a?.decision_id).toBe(s.resolution.resolves);
        const open = s.packet.open_escalations.find((e) => e.decision_id === s.resolution?.resolves);
        expect(Date.parse(a?.answered_at ?? "")).toBeLessThan(Date.parse(open?.expires_at ?? ""));
        expect(d).toMatchObject({ resolves: s.resolution.resolves, escalation: { state: "APPROVED" } });
      }),
      RUNS,
    );
  });
});
