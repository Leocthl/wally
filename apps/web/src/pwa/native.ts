// Native shell hooks for the Capacitor wrappers in apps/mobile. This file imports nothing from Capacitor: the shell's
// bridge script (apps/mobile/native/bridge.ts) puts the plugin proxies on window.Capacitor.Plugins, and every function
// here is a no-op in a browser, so the web build does not change.

/** The slice of window.Capacitor this app reads. */
export interface CapacitorGlobal {
  readonly isNativePlatform?: () => boolean;
  readonly Plugins?: Readonly<Record<string, unknown>>;
}

export interface CapacitorWindow {
  readonly Capacitor?: CapacitorGlobal;
}

declare global {
  interface Window {
    /** Present only inside the Capacitor shell. */
    readonly Capacitor?: CapacitorGlobal;
  }
}

/** True inside the iOS or Android shell. A throwing or missing bridge reads as "not native". */
export function isNative(win: CapacitorWindow | undefined = typeof window === "undefined" ? undefined : window): boolean {
  try {
    return win?.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** A native plugin proxy the shell's bridge script registered, or undefined (browser, or plugin not bundled). */
export function nativePlugin<T>(name: string, win: CapacitorWindow | undefined = typeof window === "undefined" ? undefined : window): T | undefined {
  if (!isNative(win)) return undefined;
  const plugin = win?.Capacitor?.Plugins?.[name];
  return plugin === undefined || plugin === null ? undefined : (plugin as T);
}

/** Route names that count as home: the Budget screen under every name the route table gives it (hooks/useRoute.ts: "", "budget", "booth"). */
export const HOME_ROUTES: readonly string[] = ["", "budget", "booth"];

export function isHomeHash(hash: string): boolean {
  const name = hash.replace(/^#\/?/, "").split(/[/?]/)[0] ?? "";
  return HOME_ROUTES.includes(name);
}

export type BackAction = "exit" | "back" | "home";

/** At home: leave the app. Elsewhere: step back in hash history, or jump home when this screen was the first one. */
export function backAction(hash: string, canGoBack: boolean): BackAction {
  if (isHomeHash(hash)) return "exit";
  return canGoBack ? "back" : "home";
}

interface NativeApp {
  addListener(event: "backButton", listener: (state: { readonly canGoBack?: boolean }) => void): Promise<unknown>;
  exitApp(): Promise<void>;
}

export interface BackWindow extends CapacitorWindow {
  readonly location: { hash: string };
  readonly history: { readonly length: number; back(): void };
}

function report(what: string, err: unknown): void {
  console.warn(`native: ${what} failed`, err);
}

/** Android hardware back (and the back gesture): hash history, and exit at home. Returns false when there is no App plugin. */
export function installBackButton(win: BackWindow | undefined = typeof window === "undefined" ? undefined : window): boolean {
  const app = nativePlugin<NativeApp>("App", win);
  if (!win || !app) return false;
  const onBack = ({ canGoBack }: { readonly canGoBack?: boolean }): void => {
    const action = backAction(win.location.hash, canGoBack ?? win.history.length > 1);
    if (action === "exit") app.exitApp().catch((err: unknown) => report("exitApp", err));
    else if (action === "back") win.history.back();
    else win.location.hash = "#/";
  };
  app.addListener("backButton", onBack).catch((err: unknown) => report("backButton listener", err));
  return true;
}
