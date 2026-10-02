// File-URL check of the built verifier (pnpm --filter @laisee/verifier e2e builds first). No web server: the page
// is opened from disk with the browser offline. Chromium comes from the local Playwright cache; nothing downloads.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { trace: "off", screenshot: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
