// THE swap point. Every implementation the harness runs against is chosen here and nowhere else (test/factory.test.ts
// checks it). All of them are the real ones:
//
//   engine        @laisee/core/engine                      the policy engine, R1-R12 (decide, decideCheckout)
//   orchestrator  @laisee/core/orchestrator                B2: planner, cart, judge, engine, mint, checkout, escalation, revoke
//   planner       @laisee/agent/planner replay             the scenario's recorded proposal, re-checked against the listing
//   cart          @laisee/core/cart buildCart              prices from the listing record (scenario/cart.ts is its one caller)
//   rail          @laisee/rail-sim RailSim                 SIMULATED single-use cards, seeded per scenario
//   merchant      @laisee/rail-sim MerchantStub            SIMULATED shop with the scenario's failure mode
//   executor      @laisee/core/executor createExecutor     re-quote (R12), idempotent charge; B1 calls it, the orchestrator builds its own
//   judge         @laisee/agent/judge SystemOneJudge       loopback Laya, one request, k rotations, strict parse
import { SystemOneJudge } from "@laisee/agent/judge";
import { createReplayPlanner } from "@laisee/agent/planner";
import { engine } from "@laisee/core/engine";
import { createExecutor } from "@laisee/core/executor";
import { createOrchestrator } from "@laisee/core/orchestrator";
import type { JudgePort } from "@laisee/core/ports";
import { MerchantStub, RailSim, seededRandom, type MerchantMode } from "@laisee/rail-sim";
import { TIMEOUTS_MS } from "./config";
import { hashString } from "./prng";
import type { Scenario } from "./types";
import type { Components } from "./systems/types";
import { withDeadline } from "./judge/deadline";
import { createLiveSource, type JudgeSource } from "./judge/sources";
import { createLayaClient, LAYA_MODEL } from "./judge/laya-client";
import { monotonicTimer } from "./timer";
import { governedWorlds } from "./worlds/governed";
import { orchestratedWorlds } from "./worlds/orchestrated";
import { ungovernedWorlds } from "./worlds/ungoverned";

export interface ComponentInfo {
  readonly name: string;
  /** false for a stub, fake or stand-in; a result produced with any such component is wiring evidence, not product evidence. */
  readonly real: boolean;
  readonly note: string;
}

export interface ComponentReport {
  readonly engine: ComponentInfo;
  readonly orchestrator: ComponentInfo;
  readonly planner: ComponentInfo;
  readonly cartBuilder: ComponentInfo;
  readonly rail: ComponentInfo;
  readonly merchant: ComponentInfo;
  readonly executor: ComponentInfo;
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

// Seeded from the scenario id: same scenario, same card ids and last4, on any machine.
const railFor = (scenario: Scenario): RailSim => new RailSim({ random: seededRandom(hashString(scenario.id)) });

export function createComponents(overrides: Partial<Components> = {}): Components {
  const chosen = overrides.engine ?? engine; // B1 and the orchestrator ask the same engine
  return {
    engine: chosen,
    orchestrated: orchestratedWorlds({
      engine: chosen,
      createRail: railFor,
      createMerchant: merchantFor,
      createOrchestrator,
      // The scenario's recorded proposal; the planner re-checks it against the listing before it returns it.
      createPlanner: (scenario) => createReplayPlanner({ records: [scenario.planner], catalogue: [scenario.listing], scenario: scenario.planner.scenario }),
    }),
    governed: governedWorlds({ createRail: railFor, createMerchant: merchantFor, createExecutor }),
    ungoverned: ungovernedWorlds({ createMerchant: merchantFor }),
    ...overrides,
  };
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
    // The deadline layer makes the recorded answer the one the orchestrator used (judge/deadline.ts).
    judge: withDeadline(judge),
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
    orchestrator: { name: "createOrchestrator (@laisee/core/orchestrator)", real: true, note: "B2 runs through it: seal, submit, answer, checkout, revoke over a signed log; B0 and B1 do not use it by definition" },
    planner: { name: "createReplayPlanner (@laisee/agent/planner)", real: true, note: "replays the scenario's recorded proposal (docs/05: one recorded planner output feeds all three baselines)" },
    cartBuilder: { name: "buildCart (@laisee/core/cart)", real: true, note: "prices from the listing record in HKD; used for every baseline, so all three read the same cart" },
    rail: { name: "RailSim (@laisee/rail-sim)", real: true, note: "SIMULATED single-use cards, F1 semantics" },
    merchant: { name: "MerchantStub (@laisee/rail-sim)", real: true, note: "SIMULATED shop with honest, overshoot, drift, preauth, timeout and wrong_merchant modes" },
    executor: { name: "createExecutor (@laisee/core/executor)", real: true, note: "re-quote, idempotent charge, CARD_EVENT appended to the signed log" },
    judge: { name: "SystemOneJudge (@laisee/agent/judge) on Laya typed-decisions", real: true, note: "live: the product adapter; recorded: its answers replayed" },
  };
}
