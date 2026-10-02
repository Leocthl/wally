import { defineConfig } from "vitest/config";

export default defineConfig({
  // Explicit include: the native projects and the web copy under ios/, android/ and www/ hold files vitest must not scan.
  test: { name: "mobile", include: ["test/**/*.test.ts"], environment: "node" },
});
