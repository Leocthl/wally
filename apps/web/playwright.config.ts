// Playwright tests for the booth (lane C). They serve the production build in on-device mode (VITE_API=local): the
// real stack in the page with recorded answers, no network, no key, and no probe of /api (vite preview proxies /api
// to 127.0.0.1:8787, where a live booth server may be running). The build goes to dist/e2e, so dist/index.html, which
// the booth server serves in live mode, is never replaced by an on-device build. Chromium comes from the local
// Playwright cache; nothing is downloaded by this config.
import { defineConfig, devices } from "@playwright/test";

// A port unlikely to clash with other local previews; reuseExistingServer is off so a stranger on the port fails loudly.
const PORT = 4517;
const URL = `http://127.0.0.1:${PORT}`;
/** Ignored by git and eslint like every dist/ (root .gitignore, eslint.config.js). */
const OUT_DIR = "dist/e2e";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: URL, trace: "off", screenshot: "off" },
  webServer: {
    command: `pnpm exec vite build --outDir ${OUT_DIR} --emptyOutDir && pnpm exec vite preview --outDir ${OUT_DIR} --host 127.0.0.1 --port ${PORT} --strictPort`,
    env: { VITE_API: "local" },
    url: URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
});
