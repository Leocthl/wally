// Monotonic millisecond timer, injected wherever wall time is measured. Tests pass a deterministic one.
export type Timer = () => number;
export const monotonicTimer: Timer = () => performance.now();
