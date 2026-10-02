import type { CapacitorConfig } from "@capacitor/cli";

/** Same switch as scripts/build-web.mjs: the page draws under the system bars and pads itself. Off by default. */
const EDGE_TO_EDGE = process.env.WALLY_EDGE_TO_EDGE === "1";

/**
 * Wally native shell. The web files ship inside the app (webDir) and nothing loads from a server: the app runs in
 * on-device mode (the real engine in the page, recorded model answers, rail SIMULATED). LAN mode is the one door:
 * "Connect to the booth Mac" in About points the page at http://<mac-ip>:8787 on the Wi-Fi, so Android allows mixed
 * content (page on https://localhost, booth on http) and the manifest allows cleartext; iOS allows local networking
 * (Info.plist). The booth server asks for a pairing token on every call (apps/web/server/http/lan.ts).
 * Backgrounds are not set here: a single colour cannot follow light and dark, so the native launch screens and themes
 * carry both (assets/ via scripts/gen-assets.mjs, android res/values and res/values-night).
 */
const config: CapacitorConfig = {
  appId: "app.wally.demo",
  appName: "Wally",
  webDir: "www",
  server: { androidScheme: "https" },
  // "always" insets the page below the Dynamic Island and above the home indicator (the page has viewport-fit=auto then).
  ios: { contentInset: EDGE_TO_EDGE ? "never" : "always", allowsLinkPreview: false },
  android: { allowMixedContent: true },
  plugins: {
    // The page hides the splash once it has painted (native/bridge.ts); the timer below is the worst case.
    SplashScreen: { launchAutoHide: true, launchShowDuration: 3000, launchFadeOutDuration: 200, showSpinner: false },
    // DEFAULT follows the system appearance, as the page does (color-scheme: light dark).
    StatusBar: { style: "DEFAULT", overlaysWebView: true },
    // Android 15+ is edge to edge by default: with the page on viewport-fit=auto the web view is inset by the bars.
    SystemBars: { insetsHandling: "native", initialViewportFitValueHint: EDGE_TO_EDGE ? "cover" : "auto", style: "DEFAULT" },
  },
};

export default config;
