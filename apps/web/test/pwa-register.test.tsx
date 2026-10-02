// Registration and install UX: register only in production and secure contexts, keep the install prompt, raise the
// update when a new worker waits, hand over on Reload; iOS hint only on iOS Safari outside the app, once.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallRow, IOS_HINT_KEY, IosInstallHint, promptInstall } from "../src/pwa/InstallUi";
import { isIos, isIosSafari, shouldShowIosHint } from "../src/pwa/platform";
import { applyUpdate, captureInstallPrompt, shouldRegister, watchForUpdates } from "../src/pwa/register";
import { getPwa, resetPwa, setPwa, type InstallPromptEvent } from "../src/pwa/store";
import { UpdatePrompt } from "../src/pwa/UpdatePrompt";

afterEach(() => {
  resetPwa();
  window.localStorage.clear();
});

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const CHROME_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

describe("shouldRegister", () => {
  it("registers only in a production build, in a secure context, with support, not opted out", () => {
    const ok = { prod: true, secure: true, supported: true, optOut: false };
    expect(shouldRegister(ok)).toBe(true);
    for (const key of ["prod", "secure", "supported"] as const) expect(shouldRegister({ ...ok, [key]: false }), key).toBe(false);
    expect(shouldRegister({ ...ok, optOut: true })).toBe(false);
  });
});

describe("platform", () => {
  it("detects iOS, iPadOS and iOS Safari, and when the hint should show", () => {
    expect(isIos({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: IPAD, maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: IPAD, maxTouchPoints: 0 })).toBe(false);
    expect(isIosSafari({ userAgent: CHROME_IOS, maxTouchPoints: 5 })).toBe(false);
    expect(isIos({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false);
    const safari = { userAgent: IPHONE, maxTouchPoints: 5, standalone: false, displayModeStandalone: false };
    expect(shouldShowIosHint(safari, false)).toBe(true);
    expect(shouldShowIosHint(safari, true)).toBe(false);
    expect(shouldShowIosHint({ ...safari, standalone: true }, false)).toBe(false);
  });
});

describe("install prompt", () => {
  it("keeps beforeinstallprompt for later and clears it after appinstalled", () => {
    const target = new EventTarget() as unknown as Window;
    captureInstallPrompt(target);
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: vi.fn(async () => undefined), userChoice: Promise.resolve({ outcome: "accepted" as const }) });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(getPwa().installEvent).toBe(event);
    target.dispatchEvent(new Event("appinstalled"));
    expect(getPwa()).toMatchObject({ installEvent: null, installed: true });
  });

  it("InstallRow offers Install only with a saved prompt, and the prompt resolves to installed", async () => {
    const { unmount } = render(<InstallRow />);
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
    expect(screen.getByText("Use your browser menu to install")).toBeInTheDocument();
    unmount();
    const prompt = vi.fn(async () => undefined);
    const event = Object.assign(new Event("beforeinstallprompt"), { prompt, userChoice: Promise.resolve({ outcome: "accepted" as const }) }) as unknown as InstallPromptEvent;
    act(() => setPwa({ installEvent: event }));
    render(<InstallRow />);
    await userEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(getPwa().installed).toBe(true);
    expect(await promptInstall(getPwa())).toBe(false);
  });
});

describe("iOS hint", () => {
  it("shows the two steps and remembers a dismissal", async () => {
    render(<IosInstallHint force />);
    const hint = screen.getByRole("complementary", { name: "Add Wally to your Home Screen" });
    expect(hint).toHaveTextContent("Tap the Share button in Safari");
    expect(hint).toHaveTextContent("Choose Add to Home Screen");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(window.localStorage.getItem(IOS_HINT_KEY)).toBe("1");
  });

  it("does not show in this test browser (not iOS Safari)", () => {
    render(<IosInstallHint />);
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});

function fakeWorker(state = "installed"): ServiceWorker {
  const target = new EventTarget();
  return Object.assign(target, { state, postMessage: vi.fn(), scriptURL: "./sw.js", onstatechange: null, onerror: null }) as unknown as ServiceWorker;
}

describe("updates", () => {
  it("a waiting worker under an existing controller is an update; the first install is not", () => {
    const onReady = vi.fn();
    const waiting = fakeWorker();
    watchForUpdates({ waiting, installing: null, addEventListener: vi.fn() } as unknown as ServiceWorkerRegistration, { controller: null } as ServiceWorkerContainer, onReady);
    expect(onReady).not.toHaveBeenCalled();
    watchForUpdates({ waiting, installing: null, addEventListener: vi.fn() } as unknown as ServiceWorkerRegistration, { controller: fakeWorker("activated") } as unknown as ServiceWorkerContainer, onReady);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(getPwa()).toMatchObject({ updateReady: true, waiting });
  });

  it("raises the update when an installing worker finishes while a controller exists", () => {
    const onReady = vi.fn();
    const reg = new EventTarget() as EventTarget & { installing: ServiceWorker | null; waiting: null };
    reg.installing = fakeWorker("installing");
    reg.waiting = null;
    watchForUpdates(reg as unknown as ServiceWorkerRegistration, { controller: fakeWorker("activated") } as unknown as ServiceWorkerContainer, onReady);
    reg.dispatchEvent(new Event("updatefound"));
    Object.assign(reg.installing, { state: "installed" });
    reg.installing.dispatchEvent(new Event("statechange"));
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("Reload posts SKIP_WAITING and reloads once the new worker controls the page", () => {
    const container = new EventTarget() as unknown as ServiceWorkerContainer;
    const reload = vi.fn();
    expect(applyUpdate(container, reload)).toBe(false);
    const waiting = fakeWorker();
    setPwa({ waiting, updateReady: true });
    expect(applyUpdate(container, reload)).toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event("controllerchange"));
    container.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("the update toast announces politely and its Reload hands over", async () => {
    const onReload = vi.fn();
    render(<UpdatePrompt onReload={onReload} />);
    expect(screen.getByRole("status")).toHaveTextContent("New version ready");
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).not.toHaveTextContent("New version ready");
  });
});
