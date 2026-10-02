#!/usr/bin/env node
// pnpm verify-log: offline check of an exported log with the same verifyChain the verifier page uses.
// Usage: node scripts/verify-log.mjs <log.jsonl> <public-keys.json> [checkpoint.json]
// Prints PASS and the head, or FAIL with the first failing seq and reason. Exit 0 on PASS, 1 otherwise.
// Files are decoded as strict UTF-8: invalid bytes exit 1 instead of being replaced.
// Runs the TypeScript sources of @laisee/core through Node type stripping (Node 22.18+ or 23.6+).
import { readFile } from "node:fs/promises";
import * as nodeModule from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const USAGE = "usage: node scripts/verify-log.mjs <log.jsonl> <public-keys.json> [checkpoint.json]";

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

/** Strict UTF-8: invalid bytes are an error, never U+FFFD, and a BOM stays in the text (the log is byte-exact). */
async function readText(path, label) {
  const bytes = await readFile(path);
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (err) {
    throw new Error(`${label}: not valid UTF-8`, { cause: err });
  }
}

async function readJson(path, label) {
  const text = await readText(path, label);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${label}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

function parsed(result, label) {
  if (result.ok) return result.value;
  throw new Error(`${label}: ${result.errors.map((e) => e.message).join("; ")}`);
}

async function main() {
  const [logPath, keysPath, checkpointPath, ...rest] = process.argv.slice(2);
  if (!logPath || !keysPath || rest.length > 0) throw new Error(USAGE);
  registerTsResolver();
  const verify = await import(pathToFileURL(join(ROOT, "packages/core/src/verify/index.ts")).href);
  const keys = parsed(verify.parsePublicKeys(await readJson(keysPath, "public keys")), "public keys");
  const checkpoint = checkpointPath ? parsed(verify.parseCheckpoint(await readJson(checkpointPath, "checkpoint")), "checkpoint") : undefined;
  const text = await readText(logPath, "log");
  const report = verify.verifyLogText(text, keys, checkpoint);
  if (report.ok) {
    const scope = checkpoint ? `, checkpoint seq ${checkpoint.seq} matches` : ", no checkpoint given (truncation after the last entry is not detectable)";
    process.stdout.write(`PASS ${report.head.log_id} seq 0..${report.head.seq} head ${report.head.entry_hash}${scope}\n`);
    return 0;
  }
  process.stdout.write(`FAIL seq ${report.failedSeq} ${report.reason}: ${report.detail}\n`);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`verify-log: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
