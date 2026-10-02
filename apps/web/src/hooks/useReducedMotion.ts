// prefers-reduced-motion (docs/04 Accessibility): decorative durations are zero; functional ones such as the hold stay.
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function read(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY).matches : false;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(QUERY);
    const onChange = (): void => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
