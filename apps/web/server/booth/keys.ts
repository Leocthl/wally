// Node key loading: throwaway demo keys from KEY_DIR (written by `pnpm keys:gen`); when none exist, ephemeral in-memory
// keys are generated and /api/info says so. DEMO SHORTCUT: this server holds the delegator's throwaway key and signs on
// the shopper's behalf. Key generation itself is portable (src/booth/backend/keys.ts). Never printed or logged (I8).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseKeyFile } from "@wally/core/crypto";
import type { Signer } from "@wally/core/ports";
import { ephemeralKeys, type DemoKeys } from "../../src/booth/backend/keys";

export { ephemeralKeys, throwawayAgentDid, type DemoKeys } from "../../src/booth/backend/keys";

export class KeyLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyLoadError";
  }
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
