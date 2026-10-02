// Playwright smoke test for the booth (lane C). It serves the production build and runs against the offline MockApiClient:
// no network, no key. Chromium comes from the local Playwright cache; nothing is downloaded by this config.
import { defineConfig, devices } from "@playwright/test";

// A port unlikely to clash with other local previews; reuseExistingServer is off so a stranger on the port fails loudly.
const PORT = 4517;
const URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: URL, trace: "off", screenshot: "off" },
  webServer: {
    command: `pnpm exec vite build && pnpm exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
});
