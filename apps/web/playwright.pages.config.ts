// Playwright for the GitHub Pages build only: e2e/pages/pages.spec.ts serves apps/web/dist-pages under /wally/ itself
// (its own tiny server on 127.0.0.1:8801), so there is no webServer here. `pnpm --filter @wally/web e2e:pages` builds
// dist-pages first. One Chromium, one worker, from the local Playwright cache; nothing is downloaded.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/pages",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  // The Mac is shared and often busy: a lazy chunk or a worker install may take longer than the 5 s default.
  expect: { timeout: 15_000 },
  use: { trace: "off", screenshot: "off" },
});
