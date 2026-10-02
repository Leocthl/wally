// Test rig for orchestrator-*.test.ts: the real engine, appendEntry, signers and credential, with fakes for the
// planner, judge, rail, merchant and store. SIMULATED storyline data [F20-F23].
import { createEngine } from "../src/engine";
import type { ListingRecord, LogEntry, MandateCredential, ProposeCartInput, Revocation } from "../src/generated";
import { appendEntry, signEscalationAnswer, signRevocation } from "../src/log";
import { createOrchestrator, type Orchestrator, type OrchestratorDeps, type OrchestratorEvent, type PlannerFactory } from "../src/orchestrator";
import type { EscalationAnswer, JudgePort, LogStore, MerchantPort, RailPort } from "../src/ports";
import { FakeClock, FakeJudge, FakeMerchant, FakePlanner, FakeRail, MemoryLogStore } from "../src/testing";
import { lookupOf, sequentialCartIds } from "./cart-helpers";
import { demoCredential, demoKeys, type DemoKeys } from "./log-helpers";

export const SEAL_AT = "2026-10-03T02:00:00Z";

/** Serves scripted proposals, one planner per submit (the rule planner is built per listing set too). */
export interface ScriptedPlanners {
  readonly factory: PlannerFactory;
  /** Listing sets the factory was called with. */
  readonly catalogues: readonly (readonly ListingRecord[])[];
  readonly planners: readonly FakePlanner[];
  push(...proposals: readonly (ProposeCartInput | null)[]): void;
}

export function scriptedPlanners(): ScriptedPlanners {
  let queue: readonly (ProposeCartInput | null)[] = [];
  let catalogues: readonly (readonly ListingRecord[])[] = [];
  let planners: readonly FakePlanner[] = [];
  return {
    factory: (listings) => {
      const [next = null, ...rest] = queue;
      queue = rest;
      catalogues = [...catalogues, listings];
      const planner = new FakePlanner([next]);
      planners = [...planners, planner];
      return planner;
    },
    get catalogues() {
      return catalogues;
    },
    get planners() {
      return planners;
    },
    push: (...proposals) => {
      queue = [...queue, ...proposals];
    },
  };
}

export interface Rig {
  readonly orchestrator: Orchestrator;
  readonly events: OrchestratorEvent[];
  readonly store: LogStore;
  readonly clock: FakeClock;
  readonly keys: DemoKeys;
  readonly credential: MandateCredential;
  readonly planners: ScriptedPlanners;
  readonly rail: RailPort;
  entries(): Promise<readonly LogEntry[]>;
  kinds(): Promise<readonly string[]>;
  answer(decisionId: string, choice: EscalationAnswer["choice"], at?: Date): EscalationAnswer;
  revocation(at?: Date): Revocation;
}

export interface RigOptions {
  readonly judge?: JudgePort;
  readonly rail?: RailPort;
  readonly merchant?: (rail: RailPort) => MerchantPort;
  readonly store?: LogStore;
  readonly config?: OrchestratorDeps["config"];
  readonly credential?: (keys: DemoKeys) => MandateCredential;
  readonly cartIds?: OrchestratorDeps["ids"]["cartId"];
}

export const LOG_ID = "log_demoM0";

export function rig(options: RigOptions = {}): Rig {
  const keys = demoKeys();
  const clock = new FakeClock(SEAL_AT);
  const store = options.store ?? new MemoryLogStore();
  const rail = options.rail ?? new FakeRail();
  const planners = scriptedPlanners();
  const cartIds = sequentialCartIds("orch");
  let runs = 0;
  const orchestrator = createOrchestrator({
    engine: createEngine(),
    planner: planners.factory,
    judge: options.judge ?? new FakeJudge(),
    rail,
    merchant: options.merchant?.(rail) ?? new FakeMerchant(rail),
    store,
    signer: keys.engine,
    clock,
    ids: { cartId: options.cartIds ?? (() => cartIds.cartId()), runId: () => `run_${String((runs += 1)).padStart(4, "0")}` },
    scameter: lookupOf(),
    appendEntry,
    ...(options.config === undefined ? {} : { config: options.config }),
  });
  const events: OrchestratorEvent[] = [];
  orchestrator.subscribe((e) => events.push(e));
  const entries = () => store.read(LOG_ID);
  return {
    orchestrator,
    events,
    store,
    clock,
    keys,
    credential: options.credential?.(keys) ?? demoCredential(keys),
    planners,
    rail,
    entries,
    kinds: async () => (await entries()).map((e) => e.kind),
    answer: (decisionId, choice, at = clock.now()) => signEscalationAnswer({ decision_id: decisionId, choice, answered_at: at }, keys.delegator),
    revocation: (at = clock.now()) => signRevocation({ mandate_id: "mnd_demoM0", revoked_at: at, reason: "test revoke (SIMULATED)" }, keys.delegator),
  };
}

/** A promise you resolve from the test, for holding a port mid-call. */
export function deferred<T>(): { readonly promise: Promise<T>; resolve(value: T): void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Lets queued microtasks and timers of 0 ms run. */
export const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
