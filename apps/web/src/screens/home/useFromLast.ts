// A figure that was last shown at one value and now has another should travel between them, also when the screen it
// sits on was left in between (Budget, Wally buys something, Budget again). The last value shown is kept for the page's
// life, per key. The first time there is nothing to travel from, so the figure appears as it is.
import { useEffect, useState } from "react";

const lastShown = new Map<string, number>();

/** What to draw now: the value last shown for `key` on the first frame, then `value` from the next effect on. */
export function useFromLast(key: string, value: number): number {
  const [shown, setShown] = useState<number>(() => lastShown.get(key) ?? value);
  useEffect(() => {
    setShown(value);
    lastShown.set(key, value);
  }, [key, value]);
  return shown;
}

/** Forgets what was shown (tests, a reset of the demo). */
export function forgetLastShown(): void {
  lastShown.clear();
}
