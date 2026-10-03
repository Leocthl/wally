#!/usr/bin/env node
// pnpm keys:gen: throwaway demo keys (rail SIMULATED). Writes KEY_DIR/engine.json and KEY_DIR/delegator.json
// (mode 600, directory 700, gitignored) and the public keys only to data/public-keys.json (committed).
// The agent did:key is an identifier: its secret key is discarded at once (I4, the planner holds no key).
// Never prints or logs a secret (I8).
// Usage: node scripts/keys-gen.mjs [--force] [--key-dir <dir>] [--public <file>]
// Runs the TypeScript sources of @wally/core through Node type stripping (Node 22.18+ or 23.6+).
import { chmod, mkdir, rename, stat, writeFile } from "node:fs/promises";
import * as nodeModule from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SECRET_FILE_MODE = 0o600;
const SECRET_DIR_MODE = 0o700;
const ROLES = ["engine", "delegator"];
const USAGE = "usage: node scripts/keys-gen.mjs [--force] [--key-dir <dir>] [--public <file>]\n";

function registerTsResolver() {
  if (typeof nodeModule.registerHooks !== "function" || !process.features.typescript) {
    throw new Error("needs Node with TypeScript type stripping and module.registerHooks (22.18+ or 23.6+)");
  }
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (err) {
        for (const suffix of [".ts", "/index.ts", ".js"]) {
          try {
            return nextResolve(specifier + suffix, context);
          } catch {
            // try the next suffix
          }
        }
        throw err;
      }
    },
  });
}

function parseArgs(argv) {
  const opts = { force: false, keyDir: resolve(ROOT, process.env.KEY_DIR || ".keys"), publicFile: join(ROOT, "data/public-keys.json") };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--force") opts.force = true;
    else if (arg === "--key-dir" && argv[i + 1]) opts.keyDir = resolve(argv[++i]);
    else if (arg === "--public" && argv[i + 1]) opts.publicFile = resolve(argv[++i]);
    else throw new Error(`unknown argument ${arg}\n${USAGE}`);
  }
  return opts;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Write to a fresh 600 file, then rename over the target, so a secret never sits in a wider-mode file. */
async function writeSecret(path, text) {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, text, { mode: SECRET_FILE_MODE, flag: "wx" });
  await chmod(tmp, SECRET_FILE_MODE);
  await rename(tmp, path);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  registerTsResolver();
  const crypto = await import(pathToFileURL(join(ROOT, "packages/core/src/crypto/index.ts")).href);
  const paths = ROLES.map((role) => join(opts.keyDir, `${role}.json`));
  if (!opts.force && (await Promise.all(paths.map(exists))).some(Boolean)) {
    throw new Error(`keys already exist in ${opts.keyDir}; pass --force to replace them (old logs then fail SIGNATURE)`);
  }
  await mkdir(opts.keyDir, { recursive: true, mode: SECRET_DIR_MODE });
  await chmod(opts.keyDir, SECRET_DIR_MODE);
  const dids = {};
  for (const [i, role] of ROLES.entries()) {
    const pair = crypto.generateKeyPair();
    const text = crypto.serializeKeyFile(role, pair.secretKey);
    dids[role] = crypto.parseKeyFile(JSON.parse(text), role).did;
    await writeSecret(paths[i], text);
    pair.secretKey.fill(0);
  }
  const agent = crypto.generateKeyPair();
  const agentDid = crypto.didKeyFromPublicKey(agent.publicKey);
  agent.secretKey.fill(0);
  const publicKeys = {
    note: "Throwaway demo keys from pnpm keys:gen (rail SIMULATED). Public keys only; secrets stay in KEY_DIR, never committed.",
    engine: [dids.engine],
    delegator: dids.delegator,
    agent: agentDid,
  };
  await mkdir(dirname(opts.publicFile), { recursive: true });
  await writeFile(opts.publicFile, `${JSON.stringify(publicKeys, null, 2)}\n`);
  process.stdout.write(
    `wrote ${paths.join(" and ")} (mode 600) and ${opts.publicFile}\n` +
      `engine     ${dids.engine}\ndelegator  ${dids.delegator}\nagent      ${agentDid} (no secret kept)\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`keys:gen failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
