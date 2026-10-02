// @laisee/core/executor: deterministic checkout (log standing H3, re-quote R12, present the handle, record the rail's
// own CARD_EVENT H5), plus the void and expiry bridges from rail events to log entries. Rail and merchant are SIMULATED.
// Imports ports, schema validators and the pure packet fold and rule helpers: no rail-sim, no crypto module, no log
// writer (signing happens inside the injected AppendEntry).
import { runCheckout } from "./checkout";
import { EXECUTOR_DEFAULTS } from "./config";
import { runExpireDue, runVoid } from "./lifecycle";
import { describeError, errorOutcome, expireErrorOutcome } from "./outcome";
import { createExclusive } from "./queue";
import type { Executor, ExecutorDeps } from "./types";

/** Appends to one log queue up: appendEntry reads the head and writes head + 1, so two at once would collide. */
function withSerialAppends(deps: ExecutorDeps): ExecutorDeps {
  const exclusive = createExclusive();
  return {
    ...deps,
    appendEntry: (store, signer, logId, kind, payload, now) =>
      exclusive(logId, () => deps.appendEntry(store, signer, logId, kind, payload, now)),
  };
}

export function createExecutor(unserialised: ExecutorDeps): Executor {
  const deps = withSerialAppends(unserialised);
  const maxCalls = deps.maxCheckoutCalls ?? EXECUTOR_DEFAULTS.maxCheckoutCalls;
  if (!Number.isInteger(maxCalls) || maxCalls < 1) {
    throw new RangeError(`maxCheckoutCalls must be an integer >= 1, got ${String(maxCalls)}`);
  }
  // One card at a time: concurrent checkouts or voids on the same card queue up; other cards run in parallel.
  const exclusive = createExclusive();
  return {
    checkout: (input) => exclusive(input?.card?.id ?? "", () => runCheckout(deps, maxCalls, input)),
    voidCard: (input) =>
      exclusive(input?.cardId ?? "", async () => {
        try {
          return await runVoid(deps, input);
        } catch (err) {
          return errorOutcome("RAIL_REJECTED", describeError(err));
        }
      }),
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
