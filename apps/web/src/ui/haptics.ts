// Haptics: short vibration patterns where the browser supports them (Android Chrome); iOS Safari has none, so this is a
// no-op there. Off under reduced motion. Never the only feedback: every haptic pairs with a visible change.
export type HapticKind = "tap" | "success" | "warning" | "stop";

export const HAPTIC_PATTERNS: Readonly<Record<HapticKind, readonly number[]>> = {
  tap: [8],
  success: [12, 40, 18],
  warning: [20, 60, 20],
  stop: [30, 40, 30, 40, 30],
};

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Returns true when a vibration was requested. */
export function haptic(kind: HapticKind): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  if (reducedMotion()) return false;
  try {
    return navigator.vibrate([...HAPTIC_PATTERNS[kind]]);
  } catch {
    return false;
  }
}
