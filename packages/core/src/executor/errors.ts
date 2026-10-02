// Errors the executor understands. The merchant stub (rail-sim) throws SimulatedTimeoutError; core defines it
// so the executor can recognise it without importing rail-sim (boundary: core never imports rail-sim).

export const SIMULATED_TIMEOUT_CODE = "SIMULATED_TIMEOUT";

/** A SIMULATED merchant timeout: the response was lost. The charge may or may not have landed. */
export class SimulatedTimeoutError extends Error {
  readonly code = SIMULATED_TIMEOUT_CODE;

  constructor(message = "SIMULATED merchant timeout: no response; retry with the same idempotency key") {
    super(message);
    this.name = "SimulatedTimeoutError";
  }
}

/** Structural check, so a copy of the class from another module instance still counts. */
export function isSimulatedTimeout(err: unknown): boolean {
  if (err instanceof SimulatedTimeoutError) return true;
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === SIMULATED_TIMEOUT_CODE;
}
