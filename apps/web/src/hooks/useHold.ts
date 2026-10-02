// Hold-to-confirm timing. The smooth fill is CSS; this hook only owns the timers, so tests can drive it with fake timers.
// Early release cancels. Under reduced motion it also ticks a step counter so the fill advances in steps (docs/04).
import { useCallback, useEffect, useRef, useState } from "react";
import { HOLD_MS, HOLD_REDUCED_STEPS } from "../design/motion";

export interface Hold {
  readonly holding: boolean;
  readonly step: number;
  readonly done: boolean;
  start(): void;
  cancel(): void;
}

export function useHold(onComplete: () => void, reduced: boolean): Hold {
  const [holding, setHolding] = useState(false);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const active = useRef(false);
  const latest = useRef(onComplete);
  latest.current = onComplete;

  const clear = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    if (interval.current) clearInterval(interval.current);
    timeout.current = null;
    interval.current = null;
  }, []);

  const cancel = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    clear();
    setHolding(false);
    setStep(0);
  }, [clear]);

  const start = useCallback(() => {
    if (active.current || done) return;
    active.current = true;
    setHolding(true);
    setStep(0);
    if (reduced) interval.current = setInterval(() => setStep((n) => Math.min(HOLD_REDUCED_STEPS, n + 1)), HOLD_MS / HOLD_REDUCED_STEPS);
    timeout.current = setTimeout(() => {
      active.current = false;
      clear();
      setHolding(false);
      setDone(true);
      latest.current();
    }, HOLD_MS);
  }, [clear, done, reduced]);

  useEffect(() => clear, [clear]);
  return { holding, step, done, start, cancel };
}
