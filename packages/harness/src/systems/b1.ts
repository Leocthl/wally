// B1: rules R1-R8 and R12 plus the rail limit, no judge. It reuses the engine's own rule results and folds the outcome
// over R1-R8 only; R9 (seller check) and R10 (judge) are left out by definition. R12 runs in the executor, as in B2.
import type { Decision } from "@laisee/core/generated";
import type { JudgeRecord } from "@laisee/core/ports";
import { CLEAN_ANSWERS } from "@laisee/core/testing";
import type { Scenario } from "../types";
import type { Gate, GateDecision } from "./pipeline";
import { foldRules, ruleOfTemplate } from "./summary";
import { engineCheckout } from "./b2";
import type { SystemDeps, World } from "./types";

/** Stands in for "no judge": a shadow record, so a conforming engine skips R10 and the fold ignores it either way. */
export const NO_JUDGE: JudgeRecord = {
  provider: "replay",
  model: "none",
  version: "b1-no-judge",
  status: "OK",
  latency_ms: 0,
  shadow: true,
  answers: CLEAN_ANSWERS,
};

const KEPT = (id: string): boolean => id !== "R9" && id !== "R10";

/** The engine's Decision with its outcome recomputed over R1-R8: the Decision B1 hands to the rail on APPROVE. */
function approvedByRules(decision: Decision, limitMinor: number): Decision {
  const { explanation: _explanation, escalation: _escalation, ...rest } = decision;
  return { ...rest, outcome: "APPROVE", approved_limit_minor: limitMinor };
}

export function createB1Gate(deps: Pick<SystemDeps, "components">): Gate {
  const { engine } = deps.components;
  return {
    async decide(scenario: Scenario, world: World): Promise<GateDecision> {
      const decision = engine.decide(scenario.mandate, scenario.packet, scenario.cart, NO_JUDGE, new Date(scenario.now), undefined, {
        mandateProofValid: world.mandateProofValid === true,
      });
      const folded = foldRules(decision.rules, KEPT);
      const template = folded.primary?.template_id ?? null;
      const approved = folded.outcome === "APPROVE" ? approvedByRules(decision, scenario.cart.total_minor) : null;
      return {
        facts: { outcome: folded.outcome, rule: folded.primary?.id ?? ruleOfTemplate(template ?? undefined), templateId: template, decisionId: decision.id },
        entry: approved ?? decision,
        forRail: approved,
        judge: null,
      };
    },
    decideCheckout: engineCheckout(engine),
  };
}
