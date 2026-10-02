import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "core",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Generated types and the test fakes are not the product; the gate is on what ships.
      exclude: ["src/generated/**", "src/testing/**", "src/**/*.test.ts"],
      reporter: ["text-summary", "json-summary"],
      // F44: 80% line coverage on packages/core.
      thresholds: { lines: 80 },
    },
  },
});
