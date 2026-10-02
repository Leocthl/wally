// The native shell hooks (apps/mobile wraps this build with Capacitor): detection, plugin lookup, the Android back
// button, the service worker staying off, and haptics through the Haptics plugin. Fake windows only, no Capacitor import.
import { afterEach, describe, expect, it, vi } from "vitest";
import { haptic, HAPTIC_PATTERNS, type HapticKind, type HapticWindow } from "../src/ui/haptics";
import { ROUTE_NAMES, parseHash } from "../src/hooks/useRoute";
import { backAction, HOME_ROUTES, installBackButton, isHomeHash, isNative, nativePlugin, type BackWindow } from "../src/pwa/native";
import { shouldRegister } from "../src/pwa/register";

const nativeWindow = (plugins: Readonly<Record<string, unknown>> = {}) => ({ Capacitor: { isNativePlatform: () => true, Plugins: plugins } });

describe("isNative and nativePlugin", () => {
  it("is true only when Capacitor reports a native platform", () => {
    expect(isNative({})).toBe(false);
    expect(isNative({ Capacitor: {} })).toBe(false);
    expect(isNative({ Capacitor: { isNativePlatform: () => false } })).toBe(false);
    expect(isNative({ Capacitor: { isNativePlatform: () => { throw new Error("bridge gone"); } } })).toBe(false);
    expect(isNative(nativeWindow())).toBe(true);
  });

  it("returns a registered plugin inside the shell and nothing in a browser", () => {
    const Haptics = { impact: vi.fn() };
    expect(nativePlugin("Haptics", nativeWindow({ Haptics }))).toBe(Haptics);
    expect(nativePlugin("App", nativeWindow({ Haptics }))).toBeUndefined();
    expect(nativePlugin("Haptics", { Capacitor: { isNativePlatform: () => false, Plugins: { Haptics } } })).toBeUndefined();
    expect(nativePlugin("Haptics", {})).toBeUndefined();
  });
});

describe("service worker", () => {
  it("never registers inside the native shell", () => {
    const ok = { prod: true, secure: true, supported: true, optOut: false };
    expect(shouldRegister(ok)).toBe(true);
    expect(shouldRegister({ ...ok, native: false })).toBe(true);
    expect(shouldRegister({ ...ok, native: true })).toBe(false);
  });

  it("boots as an installed app: no install prompt kept, install row says installed, back button wired", async () => {
    const addListener = vi.fn(async () => ({ remove: async () => undefined }));
    Object.assign(window, nativeWindow({ App: { addListener, exitApp: vi.fn() } }));
    try {
      vi.resetModules();
      const { getPwa } = await import("../src/pwa/store");
      await import("../src/pwa/register");
      window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: vi.fn() }));
      expect(getPwa()).toMatchObject({ installed: true, installEvent: null });
      expect(addListener).toHaveBeenCalledWith("backButton", expect.any(Function));
    } finally {
      Reflect.deleteProperty(window, "Capacitor");
    }
  });
});

describe("back button", () => {
  it("treats the empty hash, #/budget and #/booth as home", () => {
    for (const hash of ["", "#", "#/", "#/budget", "#/budget?x=1", "#/booth"]) expect(isHomeHash(hash), hash).toBe(true);
    for (const hash of ["#/seal", "#/run", "#/evidence", "#/budget-old"]) expect(isHomeHash(hash), hash).toBe(false);
  });

  it("home is exactly the names the app's route table shows as Budget", () => {
    for (const name of HOME_ROUTES) expect(parseHash(`#/${name}`).route.name, name).toBe("budget");
    for (const name of ROUTE_NAMES.filter((n) => n !== "budget")) {
      expect(HOME_ROUTES, name).not.toContain(name);
      expect(isHomeHash(`#/${name}`), name).toBe(false);
    }
  });

  it("exits at home, steps back with history, and jumps home without it", () => {
    expect(backAction("#/budget", true)).toBe("exit");
    expect(backAction("#/budget", false)).toBe("exit");
    expect(backAction("#/seal", true)).toBe("back");
    expect(backAction("#/seal", false)).toBe("home");
  });

  function shell(hash: string, historyLength: number) {
    const handlers: Array<(state: { canGoBack?: boolean }) => void> = [];
    const exitApp = vi.fn(async () => undefined);
    const back = vi.fn();
    const App = { addListener: vi.fn(async (_event: string, listener: (state: { canGoBack?: boolean }) => void) => { handlers.push(listener); return {}; }), exitApp };
    const win: BackWindow = { ...nativeWindow({ App }), location: { hash }, history: { length: historyLength, back } };
    return { win, App, exitApp, back, press: (state: { canGoBack?: boolean } = {}) => handlers.forEach((h) => h(state)) };
  }

  it("installs nothing in a browser or without the App plugin", () => {
    const browser: BackWindow = { location: { hash: "" }, history: { length: 1, back: vi.fn() } };
    expect(installBackButton(browser)).toBe(false);
    expect(installBackButton({ ...browser, ...nativeWindow() })).toBe(false);
  });

  it("goes back in hash history when the shell says it can", () => {
    const s = shell("#/seal", 3);
    expect(installBackButton(s.win)).toBe(true);
    expect(s.App.addListener).toHaveBeenCalledWith("backButton", expect.any(Function));
    s.press({ canGoBack: true });
    expect(s.back).toHaveBeenCalledOnce();
    expect(s.exitApp).not.toHaveBeenCalled();
  });

  it("exits the app at the home route", () => {
    const s = shell("#/budget", 4);
    installBackButton(s.win);
    s.press({ canGoBack: true });
    expect(s.exitApp).toHaveBeenCalledOnce();
    expect(s.back).not.toHaveBeenCalled();
  });

  it("uses history length when the event carries no canGoBack, and goes home when this screen was first", () => {
    const withHistory = shell("#/run", 2);
    installBackButton(withHistory.win);
    withHistory.press();
    expect(withHistory.back).toHaveBeenCalledOnce();

    const first = shell("#/run", 1);
    installBackButton(first.win);
    first.press();
    expect(first.back).not.toHaveBeenCalled();
    expect(first.win.location.hash).toBe("#/");
  });
});

describe("haptic through the Haptics plugin", () => {
  const KINDS = Object.keys(HAPTIC_PATTERNS) as HapticKind[];

  function fake(over: Partial<HapticWindow> = {}) {
    const impact = vi.fn(async () => undefined);
    const notification = vi.fn(async () => undefined);
    const vibrate = vi.fn(() => true);
    const win: HapticWindow = { ...nativeWindow({ Haptics: { impact, notification } }), navigator: { vibrate }, matchMedia: () => ({ matches: false }), ...over };
    return { win, impact, notification, vibrate };
  }

  it("maps tap to a light impact and the others to the system notification feedback", () => {
    const f = fake();
    expect(haptic("tap", f.win)).toBe(true);
    expect(f.impact).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(haptic("success", f.win)).toBe(true);
    expect(haptic("warning", f.win)).toBe(true);
    expect(haptic("stop", f.win)).toBe(true);
    expect(f.notification.mock.calls).toEqual([[{ type: "SUCCESS" }], [{ type: "WARNING" }], [{ type: "ERROR" }]]);
    expect(f.vibrate).not.toHaveBeenCalled();
  });

  it("stays off under reduced motion", () => {
    const f = fake({ matchMedia: (query) => ({ matches: query.includes("reduce") }) });
    for (const kind of KINDS) expect(haptic(kind, f.win)).toBe(false);
    expect(f.impact).not.toHaveBeenCalled();
    expect(f.notification).not.toHaveBeenCalled();
  });

  it("does not throw when the plugin rejects or throws", async () => {
    const rejecting = fake({ ...nativeWindow({ Haptics: { impact: vi.fn(async () => { throw new Error("no engine"); }), notification: vi.fn() } }) });
    expect(haptic("tap", rejecting.win)).toBe(true);
    await Promise.resolve();
    const throwing = fake({ ...nativeWindow({ Haptics: { impact: () => { throw new Error("sync"); }, notification: vi.fn() } }) });
    expect(haptic("tap", throwing.win)).toBe(false);
  });

  it("uses navigator.vibrate with the old patterns outside the shell, and does nothing without it", () => {
    const vibrate = vi.fn((_pattern: number[]) => true);
    const web: HapticWindow = { navigator: { vibrate }, matchMedia: () => ({ matches: false }) };
    for (const kind of KINDS) expect(haptic(kind, web)).toBe(true);
    expect(vibrate.mock.calls.map(([pattern]) => pattern)).toEqual(KINDS.map((kind) => [...HAPTIC_PATTERNS[kind]]));
    expect(haptic("tap", { navigator: {}, matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(haptic("tap", { navigator: { vibrate: () => { throw new Error("blocked"); } } })).toBe(false);
  });

  it("falls back to vibration in a shell whose bridge did not register Haptics", () => {
    const f = fake({ ...nativeWindow({}) });
    expect(haptic("tap", f.win)).toBe(true);
    expect(f.vibrate).toHaveBeenCalledWith([8]);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
