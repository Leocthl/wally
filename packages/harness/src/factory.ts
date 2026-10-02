// THE swap point. Every implementation the harness runs against is chosen here and nowhere else.
//
//   today (main has only stubs and fakes)          when the other lanes merge
//   engine    @laisee/core/engine (A-01 stub)  ->  the real engine, same import, nothing to change
//   rail      FakeRail from @laisee/core/testing -> rail-sim's RailPort (A-20, A-33)
//   merchant  createModalMerchant (this package) -> rail-sim's merchant stub with modes (A-22, A-34)
//   executor  createInterimExecutor              -> core's executor (A-22), wrapped to the CheckoutExecutor port
//   cart      buildCart (stand-in)               -> core's cart builder (A-31)
//   judge     createChoiceJudge over ChoiceClient-> SystemOneJudge from @laisee/agent/judge (B-14)
//
// Nothing outside this file names a concrete implementation. Tests inject their own through `overrides`.
import { engine as coreEngine } from "@laisee/core/engine";
import { FakeRail } from "@laisee/core/testing";
import type { RailPort } from "@laisee/core/ports";
import { CHECKOUT_RETRIES } from "./config";
import { buildCart, type CartBuilder } from "./scenario/cart";
import { createInterimExecutor } from "./systems/executor";
import { createModalMerchant } from "./systems/merchant-modes";
import type { Components } from "./systems/types";

export interface ComponentInfo {
  readonly name: string;
  /** false for a stub, fake or stand-in; a result produced with any such component is wiring evidence, not product evidence. */
  readonly real: boolean;
  readonly note: string;
}

export interface ComponentReport {
  readonly engine: ComponentInfo;
  readonly rail: ComponentInfo;
  readonly merchant: ComponentInfo;
  readonly executor: ComponentInfo;
  readonly cartBuilder: ComponentInfo;
}

export function createComponents(overrides: Partial<Components> = {}): Components {
  return {
    engine: coreEngine,
    createRail: (): RailPort => new FakeRail(),
    createMerchant: createModalMerchant,
    executor: createInterimExecutor(CHECKOUT_RETRIES),
    ...overrides,
  };
}

export function createCartBuilder(): CartBuilder {
  return buildCart;
}

/** What is wired in, for the result file. `engineVersion` comes from a probe Decision, so a swap is detected, not declared. */
export function describeComponents(engineVersion: string): ComponentReport {
  const engineReal = !/stub|double|reference/i.test(engineVersion);
  return {
    engine: { name: "@laisee/core/engine", real: engineReal, note: engineReal ? engineVersion : `${engineVersion}: not the real engine yet` },
    rail: { name: "FakeRail (@laisee/core/testing)", real: false, note: "SIMULATED rail, F1 semantics; replaced by rail-sim when it lands" },
    merchant: { name: "createModalMerchant (@laisee/harness)", real: false, note: "SIMULATED merchant modes; replaced by the rail-sim merchant stub" },
    executor: { name: "createInterimExecutor (@laisee/harness)", real: false, note: "interim checkout with R12 re-quote and same-key retry; replaced by core's executor" },
    cartBuilder: { name: "buildCart (@laisee/harness)", real: false, note: "stand-in for core's cart builder" },
  };
}
