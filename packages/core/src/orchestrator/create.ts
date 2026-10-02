// createOrchestrator: wires the injected ports into one packet pipeline. Every public method resolves (never
// rejects, snapshot aside): a failure is an OperationFailure plus an error event, and the queue keeps working (I5).
import { parseDidKey } from "../crypto/did-key";
import { createExecutor } from "../executor";
import type { Executor } from "../executor/types";
import { createExclusive } from "../executor/queue";
import { OrchestratorConfigError, resolveConfig } from "./config";
import { checkoutCard } from "./checkout";
import { PACKET_QUEUE_KEY, StepError, describe, sealedOrThrow, type Ctx } from "./context";
import { createEmitter, createReporter, type Run } from "./events";
import { answerSteps } from "./escalation";
import { revokeInQueue } from "./revoke";
import { sealInQueue } from "./seal";
import { EMPTY_SNAPSHOT, snapshotInQueue } from "./snapshot";
import { submitSteps } from "./submit";
import { idleTick, tickInQueue } from "./tick";
import type { CheckoutRequest, CheckoutResult, OperationFailure, Orchestrator, OrchestratorDeps, RunOutcome, SubmitResult } from "./types";

type Finished = { readonly outcome: RunOutcome; readonly code?: string };

/** run.finished for a submit or an answer: decision outcomes as they are, the rest as INFO with a code. */
function submitOutcome(result: SubmitResult): Finished {
  if (!result.ok) return { outcome: "ERROR", code: result.code };
  if (result.outcome === "NO_PROPOSAL") return { outcome: "INFO", code: `NO_PROPOSAL:${result.reason}` };
  if (result.outcome === "INVALID_CART") return { outcome: "INFO", code: `INVALID_CART:${result.code}` };
  return { outcome: result.outcome };
}

function checkoutOutcome(result: CheckoutResult): Finished {
  if (!result.ok) return { outcome: "ERROR", code: result.code };
  if (result.status === "DRIFT") return { outcome: "DENY", code: "DRIFT" };
  if (result.status === "TIMEOUT") return { outcome: "ERROR", code: "TIMEOUT" };
  return { outcome: "INFO", code: result.status === "DECLINED" ? `DECLINED:${result.event.decline_code ?? "UNKNOWN"}` : "AUTHORISED" };
}

function checkoutSteps(ctx: Ctx, run: Run, request: CheckoutRequest): Promise<CheckoutResult> {
  const sealed = sealedOrThrow(ctx);
  if (request === null || typeof request !== "object" || typeof request.cardId !== "string") {
    throw new StepError("INVALID_REQUEST", "checkout needs a card id");
  }
  const card = { cardId: request.cardId, ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }) };
  return ctx.queue(PACKET_QUEUE_KEY, () => checkoutCard(ctx, run, sealed.logId, card));
}

function failureOf(ctx: Ctx, run: Run, err: unknown): OperationFailure {
  return err instanceof StepError ? ctx.report.fail(run, err.code, err.message, err.extra) : ctx.report.fail(run, "INTERNAL", describe(err));
}

/** Runs one operation: run.started, the steps, run.finished with the outcome; failures become OperationFailure. */
async function operate<T extends { readonly ok: boolean }>(
  ctx: Ctx,
  run: Run,
  steps: () => Promise<T>,
  outcomeOf: (result: T) => { readonly outcome: RunOutcome; readonly code?: string },
): Promise<T | OperationFailure> {
  try {
    const result = await steps();
    const { outcome, code } = outcomeOf(result);
    ctx.report.finish(run, outcome, code);
    return result;
  } catch (err) {
    return failureOf(ctx, run, err);
  }
}

/** The default executor logs the rail's own event for each attempt, never the merchant's claim (H5, executor/attest.ts). */
function executorFor(deps: OrchestratorDeps): Executor {
  if (deps.executor !== undefined) return deps.executor;
  return createExecutor({ merchant: deps.merchant, rail: deps.rail, store: deps.store, signer: deps.signer, appendEntry: deps.appendEntry, clock: deps.clock });
}

export function createOrchestrator(deps: OrchestratorDeps): Orchestrator {
  if (typeof deps.delegatorDid !== "string" || parseDidKey(deps.delegatorDid) === null) {
    throw new OrchestratorConfigError("delegatorDid must be the pinned delegator's Ed25519 did:key");
  }
  const emitter = createEmitter();
  const ctx: Ctx = {
    deps,
    config: resolveConfig(deps.config),
    executor: executorFor(deps),
    report: createReporter(emitter, deps.clock, deps.ids),
    queue: createExclusive(),
    memory: { sealed: null, emittedThrough: -1, checkpoint: null },
  };
  const inQueue = <T>(task: () => Promise<T>): Promise<T> => ctx.queue(PACKET_QUEUE_KEY, task);
  return {
    seal: (credential) => {
      const run = ctx.report.start("seal");
      return operate(ctx, run, () => inQueue(() => sealInQueue(ctx, run, credential)), () => ({ outcome: "INFO", code: "SEALED" }));
    },
    submit: (request) => {
      const run = ctx.report.start("submit", request?.runId);
      return operate(ctx, run, () => submitSteps(ctx, run, request), submitOutcome);
    },
    checkout: (request) => {
      const run = ctx.report.start("checkout", request?.runId);
      return operate(ctx, run, () => checkoutSteps(ctx, run, request), checkoutOutcome);
    },
    answerEscalation: (signedAnswer, options = {}) => {
      const run = ctx.report.start("answer", options.runId);
      return operate(ctx, run, () => answerSteps(ctx, run, signedAnswer, options), submitOutcome);
    },
    revoke: (signedRevocation, options = {}) => {
      const run = ctx.report.start("revoke", options.runId);
      return operate(ctx, run, () => inQueue(() => revokeInQueue(ctx, run, sealedOrThrow(ctx), signedRevocation)), () => ({ outcome: "INFO", code: "REVOKED" }));
    },
    tick: () => {
      const sealed = ctx.memory.sealed;
      return sealed === null ? Promise.resolve(idleTick()) : inQueue(() => tickInQueue(ctx, sealed));
    },
    snapshot: () => {
      const sealed = ctx.memory.sealed;
      return sealed === null ? Promise.resolve(EMPTY_SNAPSHOT) : inQueue(() => snapshotInQueue(ctx, sealed));
    },
    subscribe: (listener) => emitter.subscribe(listener),
  };
}
