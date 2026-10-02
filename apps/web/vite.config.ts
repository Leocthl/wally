import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";
import { wallyPwa } from "./src/pwa/vitePlugin";

/** The booth server the dev server proxies /api to. WALLY_API_PORT points a dev server at your own booth server. */
const API_PORT = Number(process.env["WALLY_API_PORT"] ?? 8787);
/** SIMULATED fixtures shared with core (read only). The MockApiClient bundles them so the booth runs with no network. */
const FIXTURES = fileURLToPath(new URL("../../data/fixtures", import.meta.url));
/** Harness and judge-fit results and the human evidence files (read only), bundled so the Evidence screen needs no network. */
const RESULTS = fileURLToPath(new URL("../../data/results", import.meta.url));
const EVIDENCE = fileURLToPath(new URL("../../data/evidence", import.meta.url));

/**
 * Dev server only. Server-side modules that a production build never reaches (tree-shaken) still sit in the module graph
 * the dev server serves, and their node: imports would stop the page from booting. The browser gets inert stand-ins
 * that throw if they are ever called. Not applied to the build or to Vitest.
 */
function devNodeStubs(): Plugin {
  const STUBBED = new Set(["node:fs", "node:path"]);
  const prefix = "\0wally-node-stub:";
  return {
    name: "wally-dev-node-stubs",
    apply: (_config, env) => env.command === "serve" && process.env["VITEST"] === undefined,
    enforce: "pre",
    resolveId: (id) => (STUBBED.has(id) ? `${prefix}${id}` : null),
    load: (id) => {
      if (!id.startsWith(prefix)) return null;
      const fail = "() => { throw new Error('a node: module was called in the browser') }";
      return `export const readFileSync = ${fail}; export const readdirSync = ${fail}; export const existsSync = () => false; export const join = (...p) => p.join('/'); export const resolve = (...p) => p.join('/'); export const dirname = (p) => p; export default {};`;
    },
  };
}

export default defineConfig({
  // Relative asset paths: the built booth runs from any folder or LAN address, with hash routes and no server rules.
  base: "./",
  // PWA (lane m-design): wallyPwa emits sw.js with the hashed precache list; public/ holds the manifest and icons.
  plugins: [devNodeStubs(), react(), wallyPwa({ publicDir: fileURLToPath(new URL("./public", import.meta.url)) })],
  resolve: { alias: { "@fixtures": FIXTURES, "@results": RESULTS, "@evidence-data": EVIDENCE } },
  server: { host: "127.0.0.1", proxy: { "/api": `http://127.0.0.1:${API_PORT}` } },
  test: {
    name: "web",
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
