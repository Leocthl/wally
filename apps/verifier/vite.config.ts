import { defineConfig } from "vitest/config";
import { singleFilePage } from "./build/plugin";

// Production build: one classic IIFE bundle, inlined with the CSS into ONE index.html (build/plugin.ts), so the
// page opens from file:// (Chrome blocks module scripts there) and needs no server and no network.
// `vite` (dev) still serves index.html with its module script; the CSP is added only to the built page.
export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [singleFilePage({ template: "index.html", scriptTag: '<script type="module" src="/src/main.ts"></script>' })],
  // Library mode leaves process.env.NODE_ENV alone; the browser has no `process`.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: { entry: "src/main.ts", formats: ["iife"], name: "WallyVerifier", fileName: () => "verifier.js", cssFileName: "verifier" },
  },
  test: {
    name: "verifier",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    environment: "jsdom",
    testTimeout: 60_000,
  },
});
