import { defineConfig } from "vitest/config";

// One run covers every workspace package plus repo-level tests (lint boundaries).
export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "apps/*",
      { test: { name: "repo", include: ["tests/**/*.test.ts"], testTimeout: 60_000 } },
    ],
  },
});
