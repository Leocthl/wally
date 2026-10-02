// Playwright for the GitHub Pages build only: e2e/pages/pages.spec.ts serves apps/web/dist-pages under /wally/ itself
// (its own tiny server on 127.0.0.1:8801), so there is no webServer here. `pnpm --filter @laisee/web e2e:pages` builds
// dist-pages first. One Chromium, one worker, from the local Playwright cache; nothing is downloaded.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/pages",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { trace: "off", screenshot: "off" },
});
