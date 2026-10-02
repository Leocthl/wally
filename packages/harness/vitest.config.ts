import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "harness", include: ["test/**/*.test.ts", "src/**/*.test.ts"] },
});
