import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const API_PORT = 8787;
/** SIMULATED fixtures shared with core (read only). The MockApiClient bundles them so the booth runs with no network. */
const FIXTURES = fileURLToPath(new URL("../../data/fixtures", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@fixtures": FIXTURES } },
  server: { host: "127.0.0.1", proxy: { "/api": `http://127.0.0.1:${API_PORT}` } },
  test: {
    name: "web",
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
