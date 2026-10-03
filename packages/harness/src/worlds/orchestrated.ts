// B2's world: a real orchestrator over a real signed log. The mandate is sealed as a signed credential, the scenario's
// history is written into the log, and the orchestrator folds the packet from it. Implementations come in through
// OrchestratedParts (factory.ts chooses them); the log, the keys and the credential are core's own code.
import type { Engine, JudgePort, LogStore, MerchantPort, PlannerPort, RailPort } from "@wally/core/ports";
import type { ListingRecord } from "@wally/core/generated";
import { appendEntry, headCheckpoint, logIdForMandate, signEscalationAnswer, signRevocation } from "@wally/core/log";
import type { Orchestrator, OrchestratorDeps, PlannerFactory } from "@wally/core/orchestrator";
import { MemoryLogStore } from "@wally/core/testing";
import { verifyChain } from "@wally/core/verify";
import { DELEGATOR_DID, delegatorSigner, engineSigner } from "../keys";
import { SEAL_AGO_S } from "../scenario/history";
import { cartIdFor, scameterLookup } from "../scenario/cart";
import type { LogAudit, OrchestratedWorld } from "../systems/types";
import type { Scenario } from "../types";
import { ScenarioClock } from "./clock";
import { writeHistory } from "./history-log";
import { sealMandate, type Sealed } from "./seal";

/** The implementations an orchestrated world is built from; each has a fresh instance per scenario. */
export interface OrchestratedParts {
  readonly engine: Engine;
  readonly createRail: (scenario: Scenario) => RailPort;
  readonly createMerchant: (rail: RailPort, scenario: Scenario) => MerchantPort;
  readonly createOrchestrator: (deps: OrchestratorDeps) => Orchestrator;
  /** A planner that answers with the scenario's recorded proposal. */
  readonly createPlanner: (scenario: Scenario) => PlannerPort;
}

const plannerFor = (parts: OrchestratedParts, scenario: Scenario): PlannerFactory => (_listings: readonly ListingRecord[]) => parts.createPlanner(scenario);

/** Cart ids: the scenario's own for the first cart, then a suffixed one for each repeat (a repeat is a new cart to the builder). */
function cartIds(scenario: Scenario): { cartId(): string; runId(): string } {
  let carts = 0;
  let runs = 0;
  return {
    cartId: () => cartIdFor(scenario.cart.id, (carts += 1) - 1),
    runId: () => `run_${(runs += 1)}`,
  };
}

function sealer(): (scenario: Scenario) => Sealed {
  const delegator = delegatorSigner();
  let known: ReadonlyMap<string, Sealed> = new Map();
  return (scenario) => {
    const hit = known.get(scenario.id);
    if (hit !== undefined) return hit;
    const sealed = sealMandate(scenario, delegator);
    known = new Map([...known, [scenario.id, sealed]]);
    return sealed;
  };
}

/** `liveFromSeq`: the first entry after the seeded history; the history's own APPROVEs are not decisions of the run. */
async function auditStore(store: LogStore, logId: string, engineDid: string, liveFromSeq: number): Promise<LogAudit> {
  const entries = await store.read(logId);
  const head = await headCheckpoint(store, logId);
  const result = verifyChain(entries, { engine: [engineDid], delegator: DELEGATOR_DID }, head ?? undefined);
  return {
    entries: entries.length,
    decisions: entries.filter((e) => e.kind === "DECISION" && e.seq >= liveFromSeq).length,
    chainOk: result.ok,
    failure: result.ok ? null : `${result.reason} at seq ${result.failedSeq}`,
  };
}

export function orchestratedWorlds(parts: OrchestratedParts): (scenario: Scenario, judge: JudgePort) => Promise<OrchestratedWorld> {
  const sealOnce = sealer();
  return async (scenario, judge) => {
    const nowMs = Date.parse(scenario.now);
    const clock = new ScenarioClock(new Date(nowMs - SEAL_AGO_S * 1000));
    const store = new MemoryLogStore();
    const engine = engineSigner();
    const delegator = delegatorSigner();
    const logId = logIdForMandate(scenario.mandate.id);
    const rail = parts.createRail(scenario);
    const orchestrator = parts.createOrchestrator({
      engine: parts.engine,
      planner: plannerFor(parts, scenario),
      judge,
      rail,
      merchant: parts.createMerchant(rail, scenario),
      store,
      signer: engine,
      clock,
      ids: cartIds(scenario),
      scameter: scameterLookup(scenario.scameterCapture),
      appendEntry,
      delegatorDid: DELEGATOR_DID,
    });
    const sealed = await orchestrator.seal(sealOnce(scenario).credential);
    if (!sealed.ok) throw new Error(`the orchestrator refused to seal ${scenario.id}: ${sealed.code}: ${sealed.message}`);
    await writeHistory({ store, engine, delegator, logId }, scenario);
    clock.set(new Date(nowMs));
    const prior = (await store.read(logId)).length;
    return {
      orchestrator,
      setTime: (at) => clock.set(at),
      answer: (escalated, choice) =>
        signEscalationAnswer({ decision_id: escalated.id, mandate_id: escalated.mandate_id, cart: escalated.cart, choice, answered_at: clock.now() }, delegator),
      revocation: () => signRevocation({ mandate_id: scenario.mandate.id, revoked_at: clock.now(), reason: "revoked by the simulated delegator" }, delegator),
      entries: async () => (await store.read(logId)).slice(prior),
      audit: () => auditStore(store, logId, engine.did, prior),
    };
  };
}
