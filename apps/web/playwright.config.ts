// Playwright tests for the booth (lane C). They serve the production build in on-device mode (VITE_API=local): the
// real stack in the page with recorded answers, no network, no key, and no probe of /api (vite preview proxies /api
// to 127.0.0.1:8787, where a live booth server may be running). The build goes to dist/e2e, so dist/index.html, which
// the booth server serves in live mode, is never replaced by an on-device build. Chromium comes from the local
// Playwright cache; nothing is downloaded by this config.
import { defineConfig, devices } from "@playwright/test";

// A port unlikely to clash with other local previews; reuseExistingServer is off so a stranger on the port fails loudly.
// WALLY_E2E_PORT picks another one when two checkouts run the specs on the same Mac at once.
const PORT = Number(process.env["WALLY_E2E_PORT"] ?? 4517);
const URL = `http://127.0.0.1:${PORT}`;
/** Ignored by git and eslint like every dist/ (root .gitignore, eslint.config.js). */
const OUT_DIR = "dist/e2e";
/** The specs that need the laptop layout; every other project skips them, and the laptop project runs nothing else. */
const LAPTOP = /laptop.*\.spec\.ts$/;
/** The GitHub Pages proof serves its own build on its own port (pnpm e2e:pages); a project-level testIgnore replaces the global one, so each repeats it. */
const NOT_HERE = [LAPTOP, "**/e2e/pages/**"];
/** The first run (src/screens/onboarding) is off for every spec but its own: the flag is in storage when the page opens. */
const ONBOARDED = { cookies: [], origins: [{ origin: URL, localStorage: [{ name: "wally:onboarded", value: "1" }] }] };

export default defineConfig({
  testDir: "./e2e",
  // The GitHub Pages proof serves its own build on its own port: pnpm e2e:pages (playwright.pages.config.ts).
  testIgnore: "**/e2e/pages/**",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: URL, trace: "off", screenshot: "off", storageState: ONBOARDED },
  webServer: {
    command: `pnpm exec vite build --outDir ${OUT_DIR} --emptyOutDir && pnpm exec vite preview --outDir ${OUT_DIR} --host 127.0.0.1 --port ${PORT} --strictPort`,
    env: { VITE_API: "local" },
    url: URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] }, testIgnore: NOT_HERE },
    // The narrowest and the widest phone the screens are drawn for (the checks in e2e/a11y.spec.ts set their own widths too).
    { name: "phone-small", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 740 } }, testIgnore: NOT_HERE },
    { name: "phone-large", use: { ...devices["Pixel 7"], viewport: { width: 430, height: 932 } }, testIgnore: NOT_HERE },
    // A wide window that is still below the laptop layout (64rem): the phone column centred on its backdrop.
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1000, height: 900 } }, testIgnore: NOT_HERE },
    // A laptop (1440 x 900): top navigation, the Budget screen in columns, sheets as drawers. Only e2e/laptop*.spec.ts runs here.
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testMatch: LAPTOP },
  ],
});
