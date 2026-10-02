#!/usr/bin/env node
// pnpm demo preflight: a short PASS / WARN / FAIL list before the booth starts. Laya being down is a WARN, not a FAIL:
// the booth still runs and every decision escalates (R10.unavailable) until Laya is back. Network: loopback only.
// Usage: node scripts/booth-check.mjs [--build-if-needed]
//   --build-if-needed  builds the booth UI (pnpm --filter @laisee/web build) when apps/web/dist is missing
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MIN_NODE = [22, 12];
const DEFAULT_PORT = 8787;
const LAYA_TIMEOUT_MS = 10_000; // ASSUMED: first call after a Laya start took 2,568 ms [F26]; room for a busy server
const env = process.env;
const dirFromEnv = (name, fallback) => {
  const value = (env[name] ?? "").trim() || fallback;
  return isAbsolute(value) ? value : resolve(ROOT, value);
};
const results = [];
const record = (level, what, detail) => results.push({ level, what, detail });

function checkNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const ok = major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
  record(ok ? "PASS" : "FAIL", "node", `${process.versions.node} (needs >= ${MIN_NODE.join(".")})`);
}

function checkBuild(buildIfNeeded) {
  const ui = join(ROOT, "apps/web/dist/index.html");
  if (!existsSync(ui) && buildIfNeeded) {
    process.stdout.write("building the booth UI (pnpm --filter @laisee/web build) ...\n");
    const built = spawnSync("pnpm", ["--filter", "@laisee/web", "build"], { cwd: ROOT, stdio: "inherit" });
    if (built.status !== 0) return record("FAIL", "booth UI", "build failed");
  }
  record(existsSync(ui) ? "PASS" : "WARN", "booth UI", existsSync(ui) ? "apps/web/dist" : "not built: run pnpm --filter @laisee/web build");
  const verifier = join(ROOT, "apps/verifier/dist/index.html");
  record(existsSync(verifier) ? "PASS" : "WARN", "verifier page", existsSync(verifier) ? "apps/verifier/dist, served at /verifier/" : "not built: /verifier/ answers 404");
}

function checkKeys() {
  const dir = dirFromEnv("KEY_DIR", ".keys");
  const both = ["engine.json", "delegator.json"].every((f) => existsSync(join(dir, f)));
  record(both ? "PASS" : "WARN", "demo keys", both ? dir : `none in ${dir}: the server uses ephemeral keys (run pnpm keys:gen)`);
}

async function checkLogDir() {
  const dir = dirFromEnv("LOG_DIR", ".data/logs");
  const probe = join(dir, `.write-check-${process.pid}`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(probe, "ok");
    await rm(probe);
    record("PASS", "log dir", `${dir} writable`);
  } catch (err) {
    record("FAIL", "log dir", `${dir} not writable: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function layaUrl() {
  const raw = (env.LAYA_BASE_URL ?? env.LAYA_URL ?? "").trim() || "http://127.0.0.1:8808";
  return raw.replace(/\/+$/, "");
}

async function checkLaya() {
  const provider = (env.JUDGE_PROVIDER ?? "").trim() || "laya";
  const planner = (env.PLANNER_PROVIDER ?? "").trim() || "rule";
  if (provider !== "laya" && planner !== "rule") return record("PASS", "laya", `not used (JUDGE_PROVIDER=${provider}, PLANNER_PROVIDER=${planner}: REPLAYED, labelled)`);
  const base = layaUrl();
  try {
    const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3_000) });
    if (!health.ok) return record("WARN", "laya", `${base}/health answered ${health.status}: decisions will ESCALATE (R10.unavailable)`);
  } catch {
    return record("WARN", "laya", `${base} not reachable: the booth runs, every judged decision ESCALATEs (R10.unavailable). Start services/laya/serve.sh`);
  }
  const body = {
    model: (env.LAYA_MODEL ?? "").trim() || "typed-decisions",
    state: { listing: { title: "Cotton tee (SIMULATED)", text: "Soft cotton tee. Free shipping." } },
    questions: { scope_fit: { type: "choice", instructions: "Does this listing fit a clothing mandate?", criteria: { in_scope: "the item is clothing", out_of_scope: "the item is not clothing" } } },
  };
  const started = performance.now();
  try {
    const res = await fetch(`${base}/v1/systemone`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(LAYA_TIMEOUT_MS) });
    const ms = Math.round(performance.now() - started);
    record(res.ok ? "PASS" : "WARN", "laya warm-up", res.ok ? `${ms} ms, MEASURED(n=1)` : `answered ${res.status} in ${ms} ms`);
  } catch {
    record("WARN", "laya warm-up", `no answer within ${LAYA_TIMEOUT_MS} ms: the first decisions may ESCALATE (R10.unavailable)`);
  }
}

function checkPort() {
  const raw = (env.PORT ?? "").trim();
  const port = raw === "" ? DEFAULT_PORT : Number(raw);
  return new Promise((done) => {
    const server = createServer();
    server.once("error", () => {
      record("FAIL", "port", `127.0.0.1:${port} is in use (is the booth already running? stop it or set PORT)`);
      done();
    });
    server.listen(port, "127.0.0.1", () => server.close(() => (record("PASS", "port", `127.0.0.1:${port} free`), done())));
  });
}

async function main() {
  const buildIfNeeded = process.argv.includes("--build-if-needed");
  checkNode();
  checkBuild(buildIfNeeded);
  checkKeys();
  await checkLogDir();
  await checkLaya();
  await checkPort();
  for (const r of results) process.stdout.write(`${r.level.padEnd(4)}  ${r.what.padEnd(14)} ${r.detail}\n`);
  const failed = results.some((r) => r.level === "FAIL");
  process.stdout.write(failed ? "booth-check: FAIL\n" : "booth-check: ok (WARN items do not stop the booth)\n");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`booth-check failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
