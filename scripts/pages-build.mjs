#!/usr/bin/env node
// pnpm pages:build: the on-device app as a static site for GitHub Pages, in apps/web/dist-pages.
//   1. the web app, forced on-device (VITE_API=local: no /api call, recorded answers), with relative URLs and the Pages
//      rules, through apps/web/vite.pages.config.ts
//   2. the offline verifier page, built straight into dist-pages/verifier/
//   3. an empty .nojekyll
// apps/web/dist (the booth build) and apps/verifier/dist are never written. No network is used.
// Prove it from a sub-path in a real browser: pnpm --filter @laisee/web e2e:pages
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "apps/web/dist-pages");
const VERIFIER_OUT = join(OUT, "verifier");
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

function filesUnder(dir, prefix = "") {
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
  record(verifierFiles.join() === "index.html" ? "PASS" : "FAIL", "verifier page", verifierFiles.join() === "index.html" ? "one self-contained index.html" : `expected only index.html, found: ${verifierFiles.join(", ")}`);
  const all = filesUnder(OUT);
  const bytes = all.reduce((sum, f) => sum + statSync(join(OUT, f)).size, 0);
  record("PASS", "size", `${all.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MiB in apps/web/dist-pages`);
}

function main() {
  run("web app (on-device, relative URLs)", ["--filter", "@laisee/web", "exec", "vite", "build", "--config", "vite.pages.config.ts", "--logLevel", "warn"], { VITE_API: "local" });
  run("offline verifier page", ["--filter", "@laisee/verifier", "exec", "vite", "build", "--outDir", VERIFIER_OUT, "--emptyOutDir", "--logLevel", "warn"]);
  writeFileSync(join(OUT, ".nojekyll"), "");
  checkLayout();
  for (const r of results) process.stdout.write(`${r.level.padEnd(4)}  ${r.what.padEnd(14)} ${r.detail}\n`);
  const failed = results.some((r) => r.level === "FAIL");
  process.stdout.write(failed ? "pages:build: FAIL\n" : "pages:build: ok. Serve apps/web/dist-pages from any path, or run pnpm --filter @laisee/web e2e:pages\n");
  process.exit(failed ? 1 : 0);
}

main();
