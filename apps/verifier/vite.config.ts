import { defineConfig } from "vitest/config";

// base "./" so the built folder works from file:// with no server (offline verifier).
export default defineConfig({
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
  test: { name: "verifier", include: ["test/**/*.test.ts", "src/**/*.test.ts"], environment: "node" },
});
