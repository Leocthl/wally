// B2: the full pipeline. Judge, then engine.decide, then rail and executor. The engine is the only producer of a Decision.
import type { JudgeInput } from "@laisee/core/ports";
import { TIMEOUTS_MS } from "../config";
import type { Scenario } from "../types";
import type { Gate, GateDecision } from "./pipeline";
import { factsOf, summariseJudge } from "./summary";
import type { SystemDeps } from "./types";

export function judgeInputOf(scenario: Scenario): JudgeInput {
  return {
    intentText: scenario.mandate.intent_text,
    rules: scenario.mandate.rules,
    cart: scenario.cart,
    listingText: scenario.listing.text,
    scameter: scenario.cart.scameter,
  };
}

export function createB2Gate(deps: Pick<SystemDeps, "components" | "judgeFor">): Gate {
  return {
    async decide(scenario: Scenario): Promise<GateDecision> {
      const record = await deps.judgeFor(scenario).assess(judgeInputOf(scenario), { timeoutMs: TIMEOUTS_MS.judge });
      const decision = deps.components.engine.decide(scenario.mandate, scenario.packet, scenario.cart, record, new Date(scenario.now), undefined, {
        mandateProofValid: scenario.mandateProofValid,
      });
      return { facts: factsOf(decision), forRail: decision.outcome === "APPROVE" ? decision : null, judge: summariseJudge(record, decision) };
    },
  };
}
