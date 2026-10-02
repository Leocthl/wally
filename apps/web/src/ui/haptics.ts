// Haptics: inside the native shell (apps/mobile) the Capacitor Haptics plugin, if the shell's bridge registered it;
// otherwise short vibration patterns where the browser supports them (Android Chrome). iOS Safari has none, so this is
// a no-op there. Off under reduced motion. Never the only feedback: every haptic pairs with a visible change.
import { nativePlugin, type CapacitorWindow } from "../pwa/native";

export type HapticKind = "tap" | "success" | "warning" | "stop";

export const HAPTIC_PATTERNS: Readonly<Record<HapticKind, readonly number[]>> = {
  tap: [8],
  success: [12, 40, 18],
  warning: [20, 60, 20],
  stop: [30, 40, 30, 40, 30],
};

/** The two Capacitor Haptics calls used here. */
interface NativeHaptics {
  impact(options: { readonly style: "LIGHT" | "MEDIUM" | "HEAVY" }): Promise<void>;
  notification(options: { readonly type: "SUCCESS" | "WARNING" | "ERROR" }): Promise<void>;
}

/** A light tap, and the system's success, warning and error feedback for the other kinds. */
const NATIVE_CALLS: Readonly<Record<HapticKind, (haptics: NativeHaptics) => Promise<void>>> = {
  tap: (h) => h.impact({ style: "LIGHT" }),
  success: (h) => h.notification({ type: "SUCCESS" }),
  warning: (h) => h.notification({ type: "WARNING" }),
  stop: (h) => h.notification({ type: "ERROR" }),
};

/** What haptic() reads from the window, so tests can pass a fake. */
export interface HapticWindow extends CapacitorWindow {
  readonly navigator?: { readonly vibrate?: (pattern: number[]) => boolean };
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
}

function reducedMotion(win: HapticWindow): boolean {
  return typeof win.matchMedia === "function" && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function playNative(native: NativeHaptics, kind: HapticKind): boolean {
  try {
    // Best effort: a device or simulator without a haptic engine rejects, and feedback is never the only signal.
    NATIVE_CALLS[kind](native).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** Returns true when a haptic was requested. */
export function haptic(kind: HapticKind, win: HapticWindow | undefined = typeof window === "undefined" ? undefined : window): boolean {
  if (!win || reducedMotion(win)) return false;
  const native = nativePlugin<NativeHaptics>("Haptics", win);
  if (native) return playNative(native, kind);
  const nav = win.navigator;
  if (typeof nav?.vibrate !== "function") return false;
  try {
    return nav.vibrate([...HAPTIC_PATTERNS[kind]]);
  } catch {
    return false;
  }
}
