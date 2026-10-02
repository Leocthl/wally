// @laisee/core/executor: deterministic checkout (re-quote R12, present the handle, record CARD_EVENT), plus the
// void and expiry bridges from rail events to log entries. Rail and merchant are SIMULATED. Owner: lane A.
// Imports ports and schema validators only: no rail-sim, no crypto (signing happens inside the injected AppendEntry).
import { runCheckout } from "./checkout";
import { EXECUTOR_DEFAULTS } from "./config";
import { runExpireDue, runVoid } from "./lifecycle";
import { describeError, errorOutcome, expireErrorOutcome } from "./outcome";
import type { Executor, ExecutorDeps } from "./types";

export function createExecutor(deps: ExecutorDeps): Executor {
  const maxCalls = deps.maxCheckoutCalls ?? EXECUTOR_DEFAULTS.maxCheckoutCalls;
  if (!Number.isInteger(maxCalls) || maxCalls < 1) {
    throw new RangeError(`maxCheckoutCalls must be an integer >= 1, got ${String(maxCalls)}`);
  }
  return {
    checkout: (input) => runCheckout(deps, maxCalls, input),
    async voidCard(input) {
      try {
        return await runVoid(deps, input);
      } catch (err) {
        return errorOutcome("RAIL_REJECTED", describeError(err));
      }
    },
    async expireDue(input) {
      try {
        return await runExpireDue(deps, input);
      } catch (err) {
        return expireErrorOutcome("RAIL_REJECTED", describeError(err), []);
      }
    },
  };
}

export { EXECUTOR_DEFAULTS } from "./config";
export { SIMULATED_TIMEOUT_CODE, SimulatedTimeoutError, isSimulatedTimeout } from "./errors";
export type {
  CheckoutDrift,
  CheckoutInput,
  CheckoutOutcome,
  CheckoutSettled,
  CheckoutTimeout,
  Executor,
  ExecutorAnomaly,
  ExecutorDeps,
  ExecutorError,
  ExecutorErrorReason,
  ExpireError,
  ExpireInput,
  ExpireOutcome,
  ExpireSettled,
  VoidInput,
  VoidOutcome,
  VoidSettled,
} from "./types";
