// Small helpers shared by the executor modules: error outcomes and message hygiene.
import type { CardEvent } from "../ports";
import type { ExecutorError, ExecutorErrorReason, ExpireError } from "./types";

export interface ErrorDetails {
  readonly last4?: string;
  readonly idempotencyKey?: string;
  readonly event?: CardEvent;
}

/** Builds an ERROR outcome. Optional fields are only set when given (exactOptionalPropertyTypes). */
export function errorOutcome(reason: ExecutorErrorReason, message: string, details: ErrorDetails = {}): ExecutorError {
  return {
    status: "ERROR",
    simulated: true,
    reason,
    message,
    ...(details.last4 === undefined ? {} : { last4: details.last4 }),
    ...(details.idempotencyKey === undefined ? {} : { idempotency_key: details.idempotencyKey }),
    ...(details.event === undefined ? {} : { event: details.event }),
  };
}

export function expireErrorOutcome(reason: ExecutorErrorReason, message: string, unlogged: readonly CardEvent[]): ExpireError {
  return { status: "ERROR", simulated: true, reason, message, unlogged };
}

/** Message text of a thrown value with the card handle removed (the handle never leaves the executor, I8). */
export function describeError(err: unknown, secrets: readonly string[] = []): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : "unknown error";
  return secrets.reduce((text, secret) => (secret.length > 0 ? text.split(secret).join("[redacted]") : text), raw);
}
