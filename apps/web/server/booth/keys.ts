// Demo keys: the engine (operator) key that signs log entries and the delegator key that seals, revokes and answers
// escalations. DEMO SHORTCUT: this server holds the delegator's throwaway key and signs on the shopper's behalf; a
// real deployment keeps that key on the shopper's device. Keys come from KEY_DIR (written by `pnpm keys:gen`);
// when none exist, ephemeral in-memory keys are generated and /api/info says so. Never printed or logged (I8).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createSigner, didKeyFromPublicKey, generateKeyPair, parseKeyFile } from "@laisee/core/crypto";
import type { Signer } from "@laisee/core/ports";

export interface DemoKeys {
  readonly engine: Signer;
  readonly delegator: Signer;
  readonly source: "KEY_DIR" | "ephemeral";
}

export class KeyLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyLoadError";
  }
}

function ephemeralSigner(): Signer {
  const pair = generateKeyPair();
  const signer = createSigner(pair.secretKey);
  pair.secretKey.fill(0);
  return signer;
}

export function ephemeralKeys(): DemoKeys {
  return { engine: ephemeralSigner(), delegator: ephemeralSigner(), source: "ephemeral" };
}

function readKey(path: string, role: "engine" | "delegator"): Signer {
  try {
    return parseKeyFile(JSON.parse(readFileSync(path, "utf8")), role);
  } catch (err) {
    // The parser never echoes key material; the message names the file and the problem only.
    throw new KeyLoadError(`${path}: ${err instanceof Error ? err.message : "unreadable key file"}`);
  }
}

/** Both key files present: load them (a bad file throws). Neither present: ephemeral. One missing: throws. */
export function loadDemoKeys(keyDir: string): DemoKeys {
  const paths = { engine: join(keyDir, "engine.json"), delegator: join(keyDir, "delegator.json") };
  const present = [existsSync(paths.engine), existsSync(paths.delegator)];
  if (!present[0] && !present[1]) return ephemeralKeys();
  if (!present[0] || !present[1]) throw new KeyLoadError(`${keyDir} holds only one of engine.json and delegator.json; run pnpm keys:gen --force`);
  return { engine: readKey(paths.engine, "engine"), delegator: readKey(paths.delegator, "delegator"), source: "KEY_DIR" };
}

/** A throwaway agent identifier: the secret is wiped at once, the planner never holds a key (I4). */
export function throwawayAgentDid(): string {
  const pair = generateKeyPair();
  pair.secretKey.fill(0);
  return didKeyFromPublicKey(pair.publicKey);
}
