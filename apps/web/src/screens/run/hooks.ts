// Small motion and time hooks for the Wally screen. Both respect reduced motion: the count-up jumps straight to the
// value, and nothing here blocks input or delays content.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../ui/hooks/useMediaQuery";

const COUNT_MS = 650;
const CENTS = 100;

const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/**
 * Counts a money figure (minor units) from `from` to `to` once, in whole dollars while moving and exact at the end.
 * The caller shows the result as decoration (aria-hidden) beside the exact figure for screen readers.
 */
export function useCountUp(to: number, from: number, run: boolean): number {
  const reduced = useReducedMotion();
  const animate = run && !reduced && from !== to && typeof requestAnimationFrame === "function";
  const [value, setValue] = useState(animate ? from : to);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    if (!animate) {
      setValue(to);
      return undefined;
    }
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const raw = from + (to - from) * easeOut(t);
      setValue(t >= 1 ? to : Math.round(raw / CENTS) * CENTS);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [animate, from, to]);
  return value;
}

const TICK_MS = 1000;

function secondsUntil(target: number, now: number): number | undefined {
  return Number.isFinite(target) ? Math.max(0, Math.ceil((target - now) / TICK_MS)) : undefined;
}

/** Whole seconds until `deadline` (RFC 3339), ticking once a second while above zero. */
export function useSecondsLeft(deadline: string | undefined, now: () => number = Date.now): number | undefined {
  const target = deadline === undefined ? Number.NaN : Date.parse(deadline);
  const [left, setLeft] = useState(() => secondsUntil(target, now()));
  useEffect(() => {
    setLeft(secondsUntil(target, now()));
    if (!Number.isFinite(target)) return undefined;
    const id = setInterval(() => {
      const next = secondsUntil(target, now());
      setLeft(next);
      if (next === 0) clearInterval(id);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [target, now]);
  return left;
}
