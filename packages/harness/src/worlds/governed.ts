// The governed world: the product path for B1 and B2. RailSim mints single-use cards, the merchant stub charges through
// it, core's executor re-quotes (R12) and pays, and every decision, mint and rail event lands in a signed, hash-chained
// log (I7) that verifyChain checks at the end. Implementations come in through GovernedParts (factory.ts chooses them);
// the log, the keys and the credential are core's own code.
import type { Executor, ExecutorDeps } from "@wally/core/executor";
import { appendEntry, headCheckpoint, logIdForMandate } from "@wally/core/log";
import type { CardEvent, LogStore, MerchantPort, RailPort, Signer } from "@wally/core/ports";
import { MemoryLogStore } from "@wally/core/testing";
import { foldPacket } from "@wally/core/packet";
import { verifyChain } from "@wally/core/verify";
import { RAIL } from "../config";
import { delegatorSigner, engineSigner } from "../keys";
import type { Scenario } from "../types";
import type { CheckoutReport, LogAudit, World } from "../systems/types";
import { SEAL_AGO_S } from "../scenario/history";
import { ScenarioClock } from "./clock";
import { writeHistory } from "./history-log";
import { sealMandate, type Sealed } from "./seal";

/** The three implementations a governed world is built from; each has a fresh instance per scenario. */
export interface GovernedParts {
  readonly createRail: (scenario: Scenario) => RailPort;
  readonly createMerchant: (rail: RailPort, scenario: Scenario) => MerchantPort;
  readonly createExecutor: (deps: ExecutorDeps) => Executor;
}

const describe = (err: unknown): string => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

function reportOf(out: Awaited<ReturnType<Executor["checkout"]>>): CheckoutReport {
  switch (out.status) {
    case "AUTHORISED":
    case "DECLINED":
      return { status: "SETTLED", event: out.event };
    case "DRIFT":
      return { status: "DRIFT", quote: out.quote };
    case "TIMEOUT":
      return { status: "FAILED", error: `every checkout call timed out (${out.attempts} calls); whether the charge landed is unknown` };
    case "ERROR":
      return { status: "FAILED", error: `${out.reason}: ${out.message}` };
  }
}

/** Seals each scenario once per factory: the credential is a pure function of the scenario (Ed25519 is deterministic). */
function sealer(delegator: Signer): (scenario: Scenario) => Sealed {
  let known: ReadonlyMap<string, Sealed> = new Map();
  return (scenario) => {
    const hit = known.get(scenario.id);
    if (hit !== undefined) return hit;
    const sealed = sealMandate(scenario, delegator);
    known = new Map([...known, [scenario.id, sealed]]);
    return sealed;
  };
}

/** null when the append worked, else the reason: a decision that is not in the log must not be acted on (I7). */
async function attempt(append: () => Promise<unknown>): Promise<string | null> {
  try {
    await append();
    return null;
  } catch (err) {
    return `log append failed: ${describe(err)}`;
  }
}

/** Reads the log back and verifies the chain, the signatures and the head checkpoint the way an offline verifier would. */
async function auditLog(store: LogStore, logId: string, engineDid: string, delegatorDid: string, liveFromSeq: number): Promise<LogAudit> {
  const entries = await store.read(logId);
  const head = await headCheckpoint(store, logId);
  const result = verifyChain(entries, { engine: [engineDid], delegator: delegatorDid }, head ?? undefined);
  return {
    entries: entries.length,
    decisions: entries.filter((e) => e.kind === "DECISION" && e.seq >= liveFromSeq).length, // the seeded history has APPROVEs of its own
    chainOk: result.ok,
    failure: result.ok ? null : `${result.reason} at seq ${result.failedSeq}`,
  };
}

export function governedWorlds(parts: GovernedParts): (scenario: Scenario) => Promise<World> {
  const sealOnce = sealer(delegatorSigner());
  return async (scenario) => {
    const nowMs = Date.parse(scenario.now);
    const clock = new ScenarioClock(new Date(nowMs - SEAL_AGO_S * 1000));
    const store = new MemoryLogStore();
    const engine = engineSigner();
    const logId = logIdForMandate(scenario.mandate.id);
    const sealed = sealOnce(scenario);
    await appendEntry(store, engine, logId, "MANDATE_SEALED", sealed.credential, clock.now());
    await writeHistory({ store, engine, delegator: delegatorSigner(), logId }, scenario);
    const prior = (await store.read(logId)).length;
    clock.set(new Date(nowMs));
    const rail = parts.createRail(scenario);
    const executor = parts.createExecutor({ merchant: parts.createMerchant(rail, scenario), rail, store, signer: engine, appendEntry, clock });
    return {
      mandateProofValid: sealed.proofValid,
      setTime: (at) => clock.set(at),
      packet: async () => foldPacket(await store.read(logId), clock.now()),
      mint: (decision, merchantLock, purpose) => rail.mint({ decision, ttlMs: RAIL.cardTtlMs, now: clock.now(), merchantLock, purpose }),
      async checkout(decision, card): Promise<CheckoutReport> {
        return reportOf(await executor.checkout({ logId, decision, card }));
      },
      async voidCard(card): Promise<CardEvent | null> {
        const out = await executor.voidCard({ logId, cardId: card.id });
        return out.status === "VOIDED" ? out.event : null;
      },
      recordDecision: (decision) => attempt(() => appendEntry(store, engine, logId, "DECISION", decision, clock.now())),
      recordMint: (card) => attempt(() => appendEntry(store, engine, logId, "CARD_MINTED", card, clock.now())),
      audit: () => auditLog(store, logId, engine.did, scenario.mandate.delegator, prior),
    };
  };
}
