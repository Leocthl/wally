// A bar draws once, the first time its card is on screen: the fill is clipped until then and wipes in from the left.
// Without IntersectionObserver, or under reduced motion, nothing is clipped and nothing moves (the attribute is absent).
import { useEffect, useRef, useState, type RefObject } from "react";

export type RevealState = "pending" | "in" | undefined;

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useReveal<T extends HTMLElement>(): { readonly ref: RefObject<T | null>; readonly reveal: RevealState } {
  const ref = useRef<T>(null);
  const supported = typeof IntersectionObserver !== "undefined" && !reducedMotion();
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!supported || !node) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        io.disconnect();
      }
    }, { threshold: 0.2 });
    io.observe(node);
    return () => io.disconnect();
  }, [supported]);
  return { ref, reveal: !supported ? undefined : seen ? "in" : "pending" };
}
