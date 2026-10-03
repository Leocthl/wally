// True while an element's content is taller than the element: a region that scrolls has to be a tab stop, or a keyboard
// (Safari does not make scrollers focusable by itself) cannot scroll it. The size is read again whenever the element's box
// changes, which is how its content growing past a cap, or shrinking under it, shows.
import { useLayoutEffect, useState, type RefObject } from "react";

/** One pixel of slack: the two heights are rounded separately and differ by a hair at fractional zoom. */
const SLACK_PX = 1;

export function useOverflows(ref: RefObject<HTMLElement | null>): boolean {
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    const measure = (): void => setOverflows(el.scrollHeight > el.clientHeight + SLACK_PX);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return overflows;
}
