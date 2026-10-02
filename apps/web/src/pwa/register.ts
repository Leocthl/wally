// Service worker registration, imported once by main.tsx. Registers only in production builds, in secure contexts
// (https or localhost) where the browser supports it. A plain-http LAN address is not secure, so the phone-on-LAN booth
// runs as a normal web page there. Also keeps Chrome's install prompt for "Install Wally" and raises "New version ready".
import { getPwa, setPwa, type InstallPromptEvent } from "./store";

export interface RegisterEnv {
  readonly prod: boolean;
  readonly secure: boolean;
  readonly supported: boolean;
  /** Opt-out for debugging: localStorage "wally:sw" = "off". */
  readonly optOut: boolean;
}

export function shouldRegister(env: RegisterEnv): boolean {
  return env.prod && env.secure && env.supported && !env.optOut;
}

function readOptOut(): boolean {
  try {
    return window.localStorage.getItem("wally:sw") === "off";
  } catch {
    return false;
  }
}

export function currentEnv(): RegisterEnv {
  return {
    prod: import.meta.env.PROD,
    secure: typeof window !== "undefined" && window.isSecureContext,
    supported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    optOut: typeof window !== "undefined" && readOptOut(),
  };
}

/** Saves the install prompt for later and notes a finished install. */
export function captureInstallPrompt(target: Window = window): void {
  target.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    setPwa({ installEvent: event as InstallPromptEvent });
  });
  target.addEventListener("appinstalled", () => setPwa({ installed: true, installEvent: null }));
}

async function showUpdatePrompt(): Promise<void> {
  const { mountUpdatePrompt } = await import("./UpdatePrompt");
  mountUpdatePrompt();
}

function markReady(worker: ServiceWorker, onReady: () => void): void {
  setPwa({ updateReady: true, waiting: worker });
  onReady();
}

/** Watches a registration: a worker that finishes installing while another controls the page is an update. */
export function watchForUpdates(reg: ServiceWorkerRegistration, container: ServiceWorkerContainer, onReady: () => void): void {
  if (reg.waiting && container.controller) markReady(reg.waiting, onReady);
  reg.addEventListener("updatefound", () => {
    const worker = reg.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && container.controller) markReady(worker, onReady);
    });
  });
}

/** "Reload": tell the waiting worker to take over, then reload once when it does. */
export function applyUpdate(container: ServiceWorkerContainer = navigator.serviceWorker, reload: () => void = () => window.location.reload()): boolean {
  const worker = getPwa().waiting;
  if (!worker) return false;
  container.addEventListener("controllerchange", () => reload(), { once: true });
  worker.postMessage({ type: "SKIP_WAITING" });
  return true;
}

export async function registerServiceWorker(container: ServiceWorkerContainer = navigator.serviceWorker): Promise<ServiceWorkerRegistration> {
  const reg = await container.register("./sw.js", { scope: "./" });
  watchForUpdates(reg, container, () => void showUpdatePrompt());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reg.update().catch((err: unknown) => setPwa({ error: String(err) }));
  });
  return reg;
}

function boot(): void {
  if (typeof window === "undefined") return;
  captureInstallPrompt();
  if (!shouldRegister(currentEnv())) return;
  window.addEventListener("load", () => {
    registerServiceWorker().catch((err: unknown) => setPwa({ error: err instanceof Error ? err.message : String(err) }));
  });
}

boot();
