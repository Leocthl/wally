// One session = one sealed mandate = one orchestrator, one SIMULATED rail and merchant stub, one log (log id from the
// mandate id). Seal builds the AgentDelegationCredential (W3C VC 2.0, urn:laisee:mandate:<mnd_id>) from the UI's
// SealRequest and signs it with the delegator key (DEMO SHORTCUT, see keys.ts). The new orchestrator's events are
// held until the seal succeeds, so a refused seal changes nothing the visitor can see (fail closed).
import type { ScameterLookup } from "@laisee/core/cart";
import { parentLinkOf } from "@laisee/core/family";
import type { MandateCredential, ParentLink } from "@laisee/core/generated";
import type { Orchestrator, OrchestratorDeps, OrchestratorEvent, PlannerFactory } from "@laisee/core/orchestrator";
import type { AppendEntry, Clock, Engine, JudgePort, LogStore, Signer } from "@laisee/core/ports";
import { credentialIdForMandate, CredentialSignError, signMandateCredential, type UnsignedMandateCredential } from "@laisee/core/vc";
import { MerchantStub, RailSim, type RandomSource } from "@laisee/rail-sim";
import type { SealRequest } from "../../api/types";
import { BoothError } from "./errors";
import { exceedsMessage, type FamilyKit } from "./family";
import { throwawayAgentDid } from "./keys";

export const VC_CONTEXT: MandateCredential["@context"] = ["https://www.w3.org/ns/credentials/v2", "https://laisee.local/contexts/delegation/v1"];

export interface SessionDeps {
  readonly engine: Engine;
  readonly judge: JudgePort;
  readonly planner: PlannerFactory;
  readonly store: LogStore;
  readonly appendEntry: AppendEntry;
  readonly engineSigner: Signer;
  readonly delegator: Signer;
  readonly clock: Clock;
  readonly scameter: ScameterLookup;
  readonly random: () => RandomSource;
  readonly newId: (prefix: "mnd" | "crt" | "run") => string;
  readonly createOrchestrator: (deps: OrchestratorDeps) => Orchestrator;
}

export interface Session {
  readonly orchestrator: Orchestrator;
  readonly merchant: MerchantStub;
  readonly mandateId: string;
  readonly agentDid: string;
  readonly engineDid: string;
  readonly delegatorDid: string;
  readonly intentText: string;
  /** Mum's kit when this budget is Mei's share of Mum's; null for a budget of Mei's own. */
  readonly familyKit: FamilyKit | null;
  /** Starts delivering events to `sink` (after flushing the ones held during seal). */
  goLive(sink: (event: OrchestratorEvent) => void): void;
  close(): void;
}

export const seconds = (d: Date): string => new Date(Math.floor(d.getTime() / 1000) * 1000).toISOString().replace(".000Z", "Z");

/** The signed mandate; a credential that fails its schema is a 400 and nothing is logged. */
export function buildCredential(req: SealRequest, deps: Pick<SessionDeps, "delegator" | "clock">, mandateId: string, agentDid: string, parent?: ParentLink): MandateCredential {
  const now = deps.clock.now();
  const unsigned: UnsignedMandateCredential = {
    "@context": VC_CONTEXT,
    type: ["VerifiableCredential", "AgentDelegationCredential"],
    id: credentialIdForMandate(mandateId),
    issuer: deps.delegator.did,
    validFrom: seconds(now),
    validUntil: req.validUntil,
    credentialSubject: { id: agentDid, intent_text: req.intentText, rules: req.rules, ...(parent === undefined ? {} : { parent }) },
  };
  try {
    return signMandateCredential(unsigned, deps.delegator, { created: now });
  } catch (err) {
    if (err instanceof CredentialSignError) throw new BoothError(400, "INVALID_MANDATE", err.message);
    throw err;
  }
}

type Refused = Extract<Awaited<ReturnType<Orchestrator["seal"]>>, { ok: false }>;

/** EXCEEDS_PARENT is a 422 that carries what was asked and what is allowed; the rest keep their 400 or 500. */
function sealFailure(failed: Refused): BoothError {
  const { code, message, details } = failed;
  if (code === "EXCEEDS_PARENT" && details !== undefined) return new BoothError(422, code, exceedsMessage(details, message), { field: details.field, requested: details.requested, allowed: details.allowed });
  const status = code === "INVALID_CREDENTIAL" || code === "INVALID_REQUEST" ? 400 : 500;
  return new BoothError(status, code, message);
}

/** `kit`: seal the budget as Mei's share of Mum's (the orchestrator checks it against her credential); null: Mei's own. */
export async function openSession(deps: SessionDeps, req: SealRequest, kit: FamilyKit | null = null): Promise<Session> {
  const mandateId = deps.newId("mnd");
  const agentDid = throwawayAgentDid();
  const credential = buildCredential(req, deps, mandateId, agentDid, kit === null ? undefined : parentLinkOf(kit.credential));
  if (Date.parse(credential.validUntil) <= deps.clock.now().getTime()) throw new BoothError(400, "INVALID_MANDATE", "validUntil is in the past");
  const rail = new RailSim({ random: deps.random() });
  const merchant = new MerchantStub({ rail });
  const orchestrator = deps.createOrchestrator({
    engine: deps.engine,
    planner: deps.planner,
    judge: deps.judge,
    rail,
    merchant,
    store: deps.store,
    signer: deps.engineSigner,
    clock: deps.clock,
    ids: { cartId: () => deps.newId("crt"), runId: () => deps.newId("run") },
    scameter: deps.scameter,
    appendEntry: deps.appendEntry,
    delegatorDid: deps.delegator.did,
    ...(kit === null ? {} : { parentDid: kit.signer.did, allocations: kit.ledger }),
  });
  let held: readonly OrchestratorEvent[] = [];
  let sink: ((event: OrchestratorEvent) => void) | null = null;
  const off = orchestrator.subscribe((event) => (sink === null ? (held = [...held, event]) : sink(event)));
  const sealed = await orchestrator.seal(credential, kit === null ? undefined : { parentCredential: kit.credential });
  if (!sealed.ok) {
    off();
    throw sealFailure(sealed);
  }
  return {
    orchestrator,
    merchant,
    mandateId,
    agentDid,
    engineDid: deps.engineSigner.did,
    delegatorDid: deps.delegator.did,
    intentText: req.intentText,
    familyKit: kit,
    goLive(next) {
      const pending = held;
      held = [];
      for (const event of pending) next(event);
      sink = next;
    },
    close() {
      sink = null;
      off();
    },
  };
}
