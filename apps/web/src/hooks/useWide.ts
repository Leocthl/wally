// True from the width where the booth shows every panel side by side (60rem in shell.css). Phones start with detail folded.
import { useEffect, useState } from "react";

const QUERY = "(min-width: 60rem)";

export function useWide(): boolean {
  const read = (): boolean => typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
  const [wide, setWide] = useState<boolean>(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(QUERY);
    const onChange = (): void => setWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}
