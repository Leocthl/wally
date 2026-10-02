// Event delivery and run bookkeeping. Listeners get events synchronously, in order; a listener that throws is
// isolated so the pipeline never breaks on a subscriber bug (the log, not the event stream, is the record).
import type { Clock } from "../ports";
import type {
  OperationFailure,
  OperationName,
  OrchestratorErrorCode,
  OrchestratorEvent,
  OrchestratorIds,
  OrchestratorListener,
  RunOutcome,
  Stage,
  StageStatus,
  Unsubscribe,
} from "./types";

export interface Emitter {
  emit(event: OrchestratorEvent): void;
  subscribe(listener: OrchestratorListener): Unsubscribe;
}

export function createEmitter(): Emitter {
  let listeners: readonly OrchestratorListener[] = [];
  return {
    emit(event) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // Deliberately isolated: a subscriber fault must not stop a mint, a void or the next listener.
        }
      }
    },
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}

export interface Run {
  readonly runId: string;
  readonly operation: OperationName;
}

export type FailureExtra = Pick<OperationFailure, "decision" | "mintError" | "executorReason" | "details">;

export interface Reporter {
  emit(event: OrchestratorEvent): void;
  at(): string;
  start(operation: OperationName, runId?: string): Run;
  stage(run: Run, stage: Stage, status: StageStatus, extra?: { readonly note?: string; readonly latencyMs?: number }): void;
  finish(run: Run, outcome: RunOutcome, code?: string, note?: string): void;
  fail(run: Run, code: OrchestratorErrorCode, message: string, extra?: FailureExtra): OperationFailure;
}

/** Caller-supplied run ids are used when they are short printable strings; otherwise ids.runId(). */
const RUN_ID = /^[A-Za-z0-9_.:-]{1,64}$/;

export function createReporter(emitter: Emitter, clock: Clock, ids: OrchestratorIds): Reporter {
  const at = (): string => clock.now().toISOString();
  return {
    emit: (event) => emitter.emit(event),
    at,
    start(operation, runId) {
      const run = { runId: runId !== undefined && RUN_ID.test(runId) ? runId : ids.runId(), operation };
      emitter.emit({ type: "run.started", runId: run.runId, operation, at: at() });
      return run;
    },
    stage(run, stage, status, extra = {}) {
      emitter.emit({
        type: "stage",
        runId: run.runId,
        stage,
        status,
        ...(extra.note === undefined ? {} : { note: extra.note }),
        ...(extra.latencyMs === undefined ? {} : { latencyMs: extra.latencyMs }),
        at: at(),
      });
    },
    finish(run, outcome, code, note) {
      emitter.emit({
        type: "run.finished",
        runId: run.runId,
        operation: run.operation,
        outcome,
        ...(code === undefined ? {} : { code }),
        ...(note === undefined ? {} : { note }),
        at: at(),
      });
    },
    fail(run, code, message, extra = {}) {
      emitter.emit({ type: "error", runId: run.runId, operation: run.operation, code, message, at: at() });
      emitter.emit({ type: "run.finished", runId: run.runId, operation: run.operation, outcome: "ERROR", code, note: message, at: at() });
      return { ok: false, runId: run.runId, code, message, ...extra };
    },
  };
}
