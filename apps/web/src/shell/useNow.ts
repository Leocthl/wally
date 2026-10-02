// A clock for countdowns: re-renders every interval only while something is counting down, so idle screens stay still.
import { useEffect, useState } from "react";

const TICK_MS = 1000;

export function useNow(active: boolean, intervalMs = TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}
