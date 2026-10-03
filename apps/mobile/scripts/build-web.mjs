#!/usr/bin/env node
// Builds apps/web for the native shells into apps/mobile/www (on-device mode: VITE_API=local, never touches
// apps/web/dist), bundles native/bridge.ts next to it and loads that script before the app in index.html.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { injectBridge, insetViewport } from "./html.mjs";

const mobile = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repo = resolve(mobile, "../..");
const www = join(mobile, "www");
/** WALLY_EDGE_TO_EDGE=1 keeps the page on viewport-fit=cover; set it for `cap sync` as well (capacitor.config.ts reads it). */
const EDGE_TO_EDGE = process.env.WALLY_EDGE_TO_EDGE === "1";

function buildWeb() {
  const args = ["--filter", "@wally/web", "exec", "vite", "build", "--outDir", "../mobile/www", "--emptyOutDir"];
  const run = spawnSync("pnpm", args, { cwd: repo, stdio: "inherit", env: { ...process.env, VITE_API: "local" } });
  if (run.status !== 0) throw new Error(`web build failed (exit ${run.status ?? run.signal})`);
}

async function buildBridge() {
  await build({
    entryPoints: [join(mobile, "native/bridge.ts")],
    outfile: join(www, "native-bridge.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    legalComments: "none",
    logLevel: "warning",
  });
}

function size(dir) {
  return readdirSync(dir).reduce((sum, name) => {
    const path = join(dir, name);
    return sum + (statSync(path).isDirectory() ? size(path) : statSync(path).size);
  }, 0);
}

buildWeb();
await buildBridge();
const indexFile = join(www, "index.html");
writeFileSync(indexFile, insetViewport(injectBridge(readFileSync(indexFile, "utf8")), EDGE_TO_EDGE));
console.log(`mobile: www ready (${Math.round(size(www) / 1024)} KiB), on-device mode`);
