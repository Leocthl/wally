import { defineConfig } from "vitest/config";

// Generous defaults: the suite shares the machine with other lanes' test runs, and a replayed or live pass over scenarios is
// slow when the load average is high. Tests that run n = 150 set their own bound from test/support/timeouts.ts.
export default defineConfig({
  test: { name: "harness", include: ["test/**/*.test.ts", "src/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 240_000 },
});
