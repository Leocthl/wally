// B2: the full pipeline. Judge, then engine.decide, then rail and executor. The engine is the only producer of a Decision.
import type { JudgeInput } from "@laisee/core/ports";
import { TIMEOUTS_MS } from "../config";
import type { LaiseeEngine } from "@laisee/core/engine";
import type { Scenario } from "../types";
import type { Gate, GateDecision } from "./pipeline";
import { factsOf, summariseJudge } from "./summary";
import type { SystemDeps, World } from "./types";

export function judgeInputOf(scenario: Scenario): JudgeInput {
  return {
    intentText: scenario.mandate.intent_text,
    rules: scenario.mandate.rules,
    cart: scenario.cart,
    listingText: scenario.listing.text,
    scameter: scenario.cart.scameter,
  };
}

/** R12 at checkout through the engine: a DENY that resolves the approval, or null when the price stands. */
export function engineCheckout(engine: LaiseeEngine): NonNullable<Gate["decideCheckout"]> {
  return (scenario, world, approved, quote, at) =>
    engine.decideCheckout({ mandate: scenario.mandate, packet: scenario.packet, approved, quote, now: at, ctx: { mandateProofValid: world.mandateProofValid === true } });
}

export function createB2Gate(deps: Pick<SystemDeps, "components" | "judgeFor">): Gate {
  const { engine } = deps.components;
  return {
    async decide(scenario: Scenario, world: World): Promise<GateDecision> {
      const record = await deps.judgeFor(scenario).assess(judgeInputOf(scenario), { timeoutMs: TIMEOUTS_MS.judge });
      const decision = engine.decide(scenario.mandate, scenario.packet, scenario.cart, record, new Date(scenario.now), undefined, {
        mandateProofValid: world.mandateProofValid === true,
      });
      return { facts: factsOf(decision), entry: decision, forRail: decision.outcome === "APPROVE" ? decision : null, judge: summariseJudge(record, decision) };
    },
    decideCheckout: engineCheckout(engine),
  };
}
