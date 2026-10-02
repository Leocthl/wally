// One AbortController per assess call: it fires when the judge timeout (F34) elapses or when the caller
// aborts. The adapter never retries, so this deadline covers every request of the call.

export interface Deadline {
  readonly signal: AbortSignal;
  /** true when the timer (not the caller) aborted. */
  readonly timedOut: () => boolean;
  /** Clears the timer and the caller listener, and aborts anything still in flight. */
  readonly dispose: () => void;
}

export function createDeadline(timeoutMs: number, external?: AbortSignal): Deadline {
  const controller = new AbortController();
  let fired = false;
  const onExternalAbort = (): void => controller.abort();
  const timer = setTimeout(() => {
    fired = true;
    controller.abort();
  }, timeoutMs);
  if (external?.aborted === true) controller.abort();
  else external?.addEventListener("abort", onExternalAbort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => fired,
    dispose: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
      controller.abort();
    },
  };
}
