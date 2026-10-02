// @laisee/core/orchestrator (A-26): pipeline per docs/00 Pipeline contract v0, one serialised queue per packet.
import type { Orchestrator, OrchestratorDeps } from "./types";

const notImplemented = (method: string) => (): Promise<never> =>
  Promise.reject(new Error(`not implemented: Orchestrator.${method} (lane e-orch)`));

/** Contract stub: every method rejects until the implementation lands. */
export function createOrchestrator(_deps: OrchestratorDeps): Orchestrator {
  return {
    seal: notImplemented("seal"),
    submit: notImplemented("submit"),
    checkout: notImplemented("checkout"),
    answerEscalation: notImplemented("answerEscalation"),
    revoke: notImplemented("revoke"),
    tick: notImplemented("tick"),
    snapshot: notImplemented("snapshot"),
    subscribe: () => () => undefined,
  };
}

export type {
  AnswerOptions,
  AnswerResult,
  CardEventCause,
  CardView,
  CheckoutDriftResult,
  CheckoutMode,
  CheckoutRequest,
  CheckoutResult,
  CheckoutSettledResult,
  CheckoutTimeoutResult,
  DecidedResult,
  EscalationView,
  InvalidCartResult,
  NoProposalReason,
  NoProposalResult,
  OperationFailure,
  OperationName,
  OperationOptions,
  Orchestrator,
  OrchestratorConfig,
  OrchestratorDeps,
  OrchestratorErrorCode,
  OrchestratorEvent,
  OrchestratorIds,
  OrchestratorListener,
  OrchestratorSnapshot,
  PlannerFactory,
  RevokeResult,
  RevokeSuccess,
  RunOutcome,
  SealResult,
  SealSuccess,
  Stage,
  StageStatus,
  SubmitRequest,
  SubmitResult,
  TickProblem,
  TickResult,
  Unsubscribe,
} from "./types";
