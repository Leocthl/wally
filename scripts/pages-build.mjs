#!/usr/bin/env node
// pnpm pages:build: the on-device app as a static site for GitHub Pages (and Vercel), in apps/web/dist-pages.
//   1. the offline verifier page, built first into a temp folder (one self-contained index.html)
//   2. the web app, forced on-device (VITE_API=local: no /api call, recorded answers), with relative URLs and the Pages
//      rules, through apps/web/vite.pages.config.ts. The verifier page goes into this build as verifier/index.html
//      (WALLY_VERIFIER_FILE), so the service worker precaches it and "Open the offline checker" works with no network
//   3. an empty .nojekyll
// apps/web/dist (the booth build) and apps/verifier/dist are never written. No network is used.
// Prove it from a sub-path in a real browser: pnpm --filter @wally/web e2e:pages
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "apps/web/dist-pages");
const VERIFIER_OUT = join(OUT, "verifier");
/** The worker lists the checker under this name (apps/web/src/pwa/swPolicy.ts VERIFIER_URL). */
const VERIFIER_PRECACHED = "./verifier/index.html";
/** What a visitor and the service worker need; a missing one means the build is not deployable. */
const REQUIRED = ["index.html", "sw.js", "manifest.webmanifest", "offline.html", "favicon.svg", "icons/icon-192.png", "icons/icon-512.png", "verifier/index.html", ".nojekyll"];

const results = [];
const record = (level, what, detail) => results.push({ level, what, detail });

function run(label, args, env = {}) {
  process.stdout.write(`pages:build ${label}\n`);
  const done = spawnSync("pnpm", args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } });
  if (done.status !== 0) {
    process.stderr.write(`pages:build: ${label} failed${done.error ? `: ${done.error.message}` : ""}\n`);
    process.exit(1);
  }
}

/** Files under `dir` as relative paths; an absent folder is an empty list, so a check can say "missing" instead of crashing. */
function filesUnder(dir, prefix = "") {
  if (!existsSync(join(dir, prefix))) return [];
  return readdirSync(join(dir, prefix)).flatMap((name) => {
    const rel = prefix === "" ? name : `${prefix}/${name}`;
    return statSync(join(dir, rel)).isDirectory() ? filesUnder(dir, rel) : [rel];
  });
}

function checkLayout() {
  const missing = REQUIRED.filter((file) => !existsSync(join(OUT, file)));
  record(missing.length === 0 ? "PASS" : "FAIL", "layout", missing.length === 0 ? `${REQUIRED.length} required files present` : `missing: ${missing.join(", ")}`);
  const scripts = filesUnder(join(OUT, "assets")).filter((f) => f.endsWith(".js"));
  record(scripts.length > 0 ? "PASS" : "FAIL", "app scripts", `${scripts.length} files in assets/`);
  const verifierFiles = filesUnder(VERIFIER_OUT);
  record(verifierFiles.join() === "index.html" ? "PASS" : "FAIL", "verifier page", verifierFiles.join() === "index.html" ? "one self-contained index.html" : `expected only index.html, found: ${verifierFiles.join(", ") || "nothing"}`);
  const all = filesUnder(OUT);
  const bytes = all.reduce((sum, f) => sum + statSync(join(OUT, f)).size, 0);
  record("PASS", "size", `${all.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MiB in apps/web/dist-pages`);
  checkPrecache();
}

/** The worker's precache list, read back from the built sw.js (a JSON string inside a string literal; the minifier picks the quotes). */
function precacheList() {
  const worker = existsSync(join(OUT, "sw.js")) ? readFileSync(join(OUT, "sw.js"), "utf8") : "";
  const literal = /JSON\.parse\((["'`])((?:\\.|(?!\1)[^\\])*)\1\)/.exec(worker);
  if (literal === null) return null;
  try {
    const list = JSON.parse(JSON.parse(`"${literal[2]}"`));
    return Array.isArray(list) && list.every((u) => typeof u === "string") ? list : null;
  } catch {
    return null;
  }
}

function checkPrecache() {
  const list = precacheList();
  if (list === null) return record("FAIL", "precache", "sw.js has no readable precache list");
  const missing = list.filter((u) => u !== "./" && !existsSync(join(OUT, u)));
  const bytes = list.reduce((sum, u) => sum + (u === "./" || missing.includes(u) ? 0 : statSync(join(OUT, u)).size), 0);
  record(missing.length === 0 ? "PASS" : "FAIL", "precache", missing.length === 0 ? `${list.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MiB fetched when the worker installs` : `listed but not in the build: ${missing.join(", ")}`);
  record(list.includes(VERIFIER_PRECACHED) ? "PASS" : "FAIL", "offline checker", list.includes(VERIFIER_PRECACHED) ? "the worker precaches verifier/index.html, so Open the offline checker works with no network" : "the worker does not precache verifier/index.html: the checker would fail offline");
}

function main() {
  // The verifier is built apart and handed to the web build, which puts it in the bundle (so the worker lists it).
  const staging = mkdtempSync(join(tmpdir(), "wally-verifier-"));
  process.on("exit", () => rmSync(staging, { recursive: true, force: true }));
  run("offline verifier page", ["--filter", "@wally/verifier", "exec", "vite", "build", "--outDir", staging, "--emptyOutDir", "--logLevel", "warn"]);
  run("web app (on-device, relative URLs, with the verifier page)", ["--filter", "@wally/web", "exec", "vite", "build", "--config", "vite.pages.config.ts", "--logLevel", "warn"], { VITE_API: "local", WALLY_VERIFIER_FILE: join(staging, "index.html") });
  writeFileSync(join(OUT, ".nojekyll"), "");
  checkLayout();
  for (const r of results) process.stdout.write(`${r.level.padEnd(4)}  ${r.what.padEnd(14)} ${r.detail}\n`);
  const failed = results.some((r) => r.level === "FAIL");
  process.stdout.write(failed ? "pages:build: FAIL\n" : "pages:build: ok. Serve apps/web/dist-pages from any path, or run pnpm --filter @wally/web e2e:pages\n");
  process.exit(failed ? 1 : 0);
}

main();
