import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "rail-sim", include: ["test/**/*.test.ts", "src/**/*.test.ts"] },
});
