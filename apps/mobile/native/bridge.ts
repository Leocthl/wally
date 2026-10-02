// Native bridge script. It is bundled to www/native-bridge.js by scripts/build-web.mjs and loaded before the app, only
// inside the iOS and Android shells. Importing a Capacitor plugin registers its proxy on window.Capacitor.Plugins, which
// is where apps/web (src/pwa/native.ts, src/ui/haptics.ts) looks, so the web bundle itself never imports Capacitor.
import { App } from "@capacitor/app";
import { Haptics } from "@capacitor/haptics";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar } from "@capacitor/status-bar";

/** Held on a global so the bundler keeps the four registrations. */
const plugins = { App, Haptics, SplashScreen, StatusBar };
Reflect.set(window, "__wallyNativePlugins", Object.keys(plugins));

const FADE_MS = 200;
/** Splash stays until the page has painted twice; capacitor.config.ts sets a native timer as the worst case. */
function hideSplashWhenPainted(): void {
  const hide = (): void => {
    SplashScreen.hide({ fadeOutDuration: FADE_MS }).catch((err: unknown) => console.warn("native: splash hide failed", err));
  };
  const paint = (): void => void requestAnimationFrame(() => requestAnimationFrame(hide));
  if (document.readyState === "complete") paint();
  else window.addEventListener("load", paint, { once: true });
}

hideSplashWhenPainted();
