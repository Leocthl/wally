#!/usr/bin/env node
// pnpm demo:reset (docs/06 Reset): demo keys regenerated (keys:gen --force semantics), LOG_DIR logs cleared, and, when
// the booth server is running, POST /api/reset: packet back to HK$800 [F20], zero cards and escalations, a fresh log,
// the UI back to step 0, SIMULATED. Never touches data/ (captures, fixtures, the committed data/public-keys.json):
// the public keys of the new demo keys go to KEY_DIR/public-keys.json and /api/export serves the keys in use.
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = join(ROOT, "data");
const LOG_FILE = /^log_[A-Za-z0-9]{6,40}\.jsonl$/;
const DEFAULT_PORT = 8787;
const env = process.env;

const dirFromEnv = (name, fallback) => {
  const value = (env[name] ?? "").trim() || fallback;
  return isAbsolute(value) ? value : resolve(ROOT, value);
};
const insideData = (path) => {
  const rel = relative(DATA, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

function regenerateKeys(keyDir) {
  if (insideData(keyDir)) throw new Error(`KEY_DIR ${keyDir} is inside data/; refusing`);
  const run = spawnSync(process.execPath, [join(ROOT, "scripts/keys-gen.mjs"), "--force", "--key-dir", keyDir, "--public", join(keyDir, "public-keys.json")], { cwd: ROOT, stdio: "inherit" });
  if (run.status !== 0) throw new Error("keys:gen failed");
}

function clearLogs(logDir) {
  if (insideData(logDir)) throw new Error(`LOG_DIR ${logDir} is inside data/; refusing to delete anything there`);
  let names;
  try {
    names = readdirSync(logDir).filter((f) => LOG_FILE.test(f));
  } catch {
    return 0; // no log dir yet: nothing to clear
  }
  for (const name of names) rmSync(join(logDir, name));
  return names.length;
}

async function resetServer() {
  const raw = (env.PORT ?? "").trim();
  const port = raw === "" ? DEFAULT_PORT : Number(raw);
  const base = `http://127.0.0.1:${port}`;
  try {
    const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2_000) });
    if (!health.ok) return `server at ${base} answered ${health.status}; not reset`;
  } catch {
    return `no booth server at ${base}: it starts fresh (HK$800 packet) next time`;
  }
  const res = await fetch(`${base}/api/reset`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(30_000) });
  if (res.status !== 204) throw new Error(`POST /api/reset answered ${res.status}: ${await res.text()}`);
  return `server at ${base} reset: new keys, fresh log, packet HK$800, zero cards`;
}

async function main() {
  const keyDir = dirFromEnv("KEY_DIR", ".keys");
  const logDir = dirFromEnv("LOG_DIR", ".data/logs");
  regenerateKeys(keyDir);
  const cleared = clearLogs(logDir);
  process.stdout.write(`cleared ${cleared} log file(s) in ${logDir}\n`);
  process.stdout.write(`${await resetServer()}\n`);
  process.stdout.write("demo:reset done (rail SIMULATED; data/ untouched)\n");
}

main().catch((err) => {
  process.stderr.write(`demo:reset failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
