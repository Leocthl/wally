// The fixed scenario set and the systems the pipeline tests run, built with the real engine, rail, merchant, executor and
// orchestrator, and a keyword judge standing in for Laya.
import type { JudgePort } from "@laisee/core/ports";
import { SCENARIO_COUNT } from "../../src/config";
import { createComponents } from "../../src/factory";
import { generateScenarios } from "../../src/scenario/generate";
import { createSystems } from "../../src/systems/create";
import type { Components, SystemUnderTest } from "../../src/systems/types";
import type { Baseline, Scenario } from "../../src/types";
import { downJudge, keywordJudge } from "./keyword-model";

export const judgeFor = (s: Scenario): JudgePort => (s.events.judgeFault === "down" ? downJudge() : keywordJudge());

let tick = 0;
export const timer = (): number => (tick += 3);

export interface RigOptions {
  readonly components?: Components;
  readonly judgeFor?: (s: Scenario) => JudgePort;
  readonly measureLatency?: boolean;
}

export function systems(options: RigOptions = {}): readonly SystemUnderTest[] {
  return createSystems({
    components: options.components ?? createComponents(),
    judgeFor: options.judgeFor ?? judgeFor,
    choiceFor: () => {
      throw new Error("B0 is not used in this test");
    },
    timer,
    measureLatency: options.measureLatency ?? true,
  });
}

export function system(id: Baseline, options: RigOptions = {}): SystemUnderTest {
  const found = systems(options).find((s) => s.id === id);
  if (found === undefined) throw new Error(`no system ${id}`);
  return found;
}

/** Three seeds of the default size: every category and variant appears several times. */
export const scenarios: readonly Scenario[] = [7, 11, 2026].flatMap((seed) => generateScenarios({ seed, n: SCENARIO_COUNT.default }));

export function pick(category: string, variant: string): Scenario {
  const s = scenarios.find((x) => x.category === category && x.variant === variant);
  if (s === undefined) throw new Error(`no ${category}/${variant} scenario in the fixed seed set`);
  return s;
}
