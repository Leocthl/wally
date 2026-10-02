import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "core",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Generated types, the generated (ahead-of-time compiled) validators and the test fakes are not hand-written
      // product code; the gate is on what ships. The compiled validators are cross-checked against ajv instead.
      exclude: ["src/generated/**", "src/schema/compiled/**", "src/testing/**", "src/**/*.test.ts"],
      reporter: ["text-summary", "json-summary"],
      // F44: 80% line coverage on packages/core.
      thresholds: { lines: 80 },
    },
  },
});
