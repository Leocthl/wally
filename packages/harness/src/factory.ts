// THE swap point. Every implementation the harness runs against is chosen here and nowhere else (test/factory.test.ts
// checks it). Today all of them are the real ones except the cart builder:
//
//   engine    @laisee/core/engine                          the policy engine, R1-R12 (decide, decideCheckout)
//   rail      @laisee/rail-sim RailSim                     SIMULATED single-use cards, seeded per scenario
//   merchant  @laisee/rail-sim MerchantStub                SIMULATED shop with the scenario's failure mode
//   executor  @laisee/core/executor createExecutor         re-quote (R12), idempotent charge, CARD_EVENT in the log
//   judge     @laisee/agent/judge SystemOneJudge           loopback Laya, one request, k rotations, strict parse
//   cart      buildCart (this package)                     STAND-IN until @laisee/core/cart lands (e-orch lane)
//
// When the cart builder lands, pass it through createCartBuilder() and flip `cartBuilder.real` in describeComponents.
// When the orchestrator lands, replace systems/pipeline.ts with it; nothing else here changes.
import { SystemOneJudge } from "@laisee/agent/judge";
import { engine } from "@laisee/core/engine";
import { createExecutor } from "@laisee/core/executor";
import type { JudgePort } from "@laisee/core/ports";
import { MerchantStub, RailSim, seededRandom, type MerchantMode } from "@laisee/rail-sim";
import { TIMEOUTS_MS } from "./config";
import { hashString } from "./prng";
import { buildCart, type CartBuilder } from "./scenario/cart";
import type { Scenario } from "./types";
import type { Components } from "./systems/types";
import { createLiveSource, type JudgeSource } from "./judge/sources";
import { createLayaClient, LAYA_MODEL } from "./judge/laya-client";
import { monotonicTimer } from "./timer";
import { governedWorlds } from "./worlds/governed";
import { ungovernedWorlds } from "./worlds/ungoverned";

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
  readonly judge: ComponentInfo;
}

/** The scenario's merchant behaviour, with the size of the fault the scenario asks for. */
function merchantFor(rail: ConstructorParameters<typeof MerchantStub>[0]["rail"], scenario: Scenario): MerchantStub {
  const { merchantMode: mode, merchantDeltaMinor: delta } = scenario.events;
  const sized: Partial<Record<MerchantMode, Pick<ConstructorParameters<typeof MerchantStub>[0], "overshootMinor" | "driftMinor" | "preauthExtraMinor">>> = {
    overshoot: { overshootMinor: delta },
    drift: { driftMinor: delta },
    preauth: { preauthExtraMinor: delta },
  };
  return new MerchantStub({ rail, mode, ...(sized[mode] ?? {}) });
}

export function createComponents(overrides: Partial<Components> = {}): Components {
  return {
    engine,
    governed: governedWorlds({
      // Seeded from the scenario id: same scenario, same card ids and last4, on any machine.
      createRail: (scenario) => new RailSim({ random: seededRandom(hashString(scenario.id)) }),
      createMerchant: merchantFor,
      createExecutor,
    }),
    ungoverned: ungovernedWorlds({ createMerchant: merchantFor }),
    ...overrides,
  };
}

export function createCartBuilder(): CartBuilder {
  return buildCart;
}

export interface LiveJudgeOptions {
  readonly baseUrl: string;
}

/** The product judge on the local Laya server. Loopback only: listing text never leaves this Mac. */
export function createLiveJudge(options: LiveJudgeOptions): SystemOneJudge {
  return new SystemOneJudge({ provider: "laya", baseUrl: options.baseUrl, model: LAYA_MODEL });
}

export interface LiveSourceOptions {
  readonly baseUrl: string;
  /** Checkpoint commit the server reports, for the result file. */
  readonly revision: string | null;
  /** Capture every model call so the run can be replayed offline. */
  readonly record: boolean;
  /** Label for a recording made while the judge wording is still being tuned. */
  readonly provisional?: string | undefined;
}

/** The live judge source: the product judge for B2, B0's own client for B0, both on the same loopback server. */
export function createLiveJudgeSource(options: LiveSourceOptions): JudgeSource {
  const judge = createLiveJudge({ baseUrl: options.baseUrl });
  return createLiveSource({
    judge,
    client: createLayaClient({ baseUrl: options.baseUrl, timer: monotonicTimer, revision: options.revision }),
    // The first call after a server start is slow [F26], so the warm-up gets a generous deadline and is never measured.
    warmUp: async () => void (await judge.warmUp({ timeoutMs: TIMEOUTS_MS.judge * 20 })),
    baseUrl: options.baseUrl,
    revision: options.revision,
    record: options.record,
    ...(options.provisional === undefined ? {} : { provisional: options.provisional }),
  });
}

export type { JudgePort };

/** What is wired in, for the result file. `engineVersion` comes from a probe Decision, so a swap is detected, not declared. */
export function describeComponents(engineVersion: string): ComponentReport {
  const engineReal = !/stub|double|reference/i.test(engineVersion);
  return {
    engine: { name: "@laisee/core/engine", real: engineReal, note: engineReal ? engineVersion : `${engineVersion}: not the real engine` },
    rail: { name: "RailSim (@laisee/rail-sim)", real: true, note: "SIMULATED single-use cards, F1 semantics" },
    merchant: { name: "MerchantStub (@laisee/rail-sim)", real: true, note: "SIMULATED shop with honest, overshoot, drift, preauth, timeout and wrong_merchant modes" },
    executor: { name: "createExecutor (@laisee/core/executor)", real: true, note: "re-quote, idempotent charge, CARD_EVENT appended to the signed log" },
    cartBuilder: { name: "buildCart (@laisee/harness)", real: false, note: "stand-in until @laisee/core/cart lands (e-orch lane); priced from the listing record like the real one will be" },
    judge: { name: "SystemOneJudge (@laisee/agent/judge) on Laya typed-decisions", real: true, note: "live: the product adapter; recorded: its answers replayed" },
  };
}
