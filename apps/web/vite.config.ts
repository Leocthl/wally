import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { wallyPwa } from "./src/pwa/vitePlugin";

const API_PORT = 8787;
/** SIMULATED fixtures shared with core (read only). The MockApiClient bundles them so the booth runs with no network. */
const FIXTURES = fileURLToPath(new URL("../../data/fixtures", import.meta.url));
/** Harness and judge-fit results and the human evidence files (read only), bundled so the Evidence screen needs no network. */
const RESULTS = fileURLToPath(new URL("../../data/results", import.meta.url));
const EVIDENCE = fileURLToPath(new URL("../../data/evidence", import.meta.url));

export default defineConfig({
  // Relative asset paths: the built booth runs from any folder or LAN address, with hash routes and no server rules.
  base: "./",
  // PWA (lane m-design): wallyPwa emits sw.js with the hashed precache list; public/ holds the manifest and icons.
  plugins: [react(), wallyPwa({ publicDir: fileURLToPath(new URL("./public", import.meta.url)) })],
  resolve: { alias: { "@fixtures": FIXTURES, "@results": RESULTS, "@evidence-data": EVIDENCE } },
  server: { host: "127.0.0.1", proxy: { "/api": `http://127.0.0.1:${API_PORT}` } },
  test: {
    name: "web",
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
