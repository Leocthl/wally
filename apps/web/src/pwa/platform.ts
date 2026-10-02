// Platform checks for install UX. iPadOS reports a Mac user agent, so touch points decide there.

export interface PlatformInput {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
  readonly standalone: boolean;
  readonly displayModeStandalone: boolean;
}

export function isIos({ userAgent, maxTouchPoints }: Pick<PlatformInput, "userAgent" | "maxTouchPoints">): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/** Safari on iOS is the only iOS browser that can add a home screen web app with full standalone support. */
export function isIosSafari(input: Pick<PlatformInput, "userAgent" | "maxTouchPoints">): boolean {
  return isIos(input) && /Safari/i.test(input.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(input.userAgent);
}

export function isStandalone({ standalone, displayModeStandalone }: Pick<PlatformInput, "standalone" | "displayModeStandalone">): boolean {
  return standalone || displayModeStandalone;
}

export function readPlatform(): PlatformInput {
  if (typeof window === "undefined") return { userAgent: "", maxTouchPoints: 0, standalone: false, displayModeStandalone: false };
  const nav = navigator as Navigator & { readonly standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: nav.standalone === true,
    displayModeStandalone: typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches,
  };
}

/** The iOS hint shows once: on iOS Safari, not yet installed, not dismissed before. */
export function shouldShowIosHint(platform: PlatformInput, dismissed: boolean): boolean {
  return !dismissed && isIosSafari(platform) && !isStandalone(platform);
}
