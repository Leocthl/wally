// The throwaway demo keys of on-device mode, kept beside the session so the same keys sign the next log entries after a
// reload (KEYS.md). They are the keys the page already holds in memory today: made here, SIMULATED, worth nothing outside
// this demo. They are stored in the repo's own key-file shape (core/crypto key-file.ts) and read back through its strict
// parser, which checks that the did belongs to the secret and the role to the slot. A secret never appears in an error,
// a log line or the signer objects (I8); only the two key-file objects below carry it, and only into the stored record.
import { CryptoError, generateKeyPair, parseKeyFile, serializeKeyFile, type KeyRole } from "@wally/core/crypto";
import type { DemoKeys } from "../../../booth/backend/keys";

/** One key as `serializeKeyFile` writes it: { kind, role, did, secret_key (base64url), note }. */
export type KeyFileObject = Readonly<Record<"kind" | "role" | "did" | "secret_key" | "note", string>>;

export interface KeyFiles {
  readonly engine: KeyFileObject;
  readonly delegator: KeyFileObject;
}

export interface KeyMaterial {
  /** What the backend signs with. */
  readonly keys: DemoKeys;
  /** The same two keys in the form that is stored. */
  readonly files: KeyFiles;
}

function freshFile(role: KeyRole): KeyFileObject {
  const pair = generateKeyPair();
  try {
    return JSON.parse(serializeKeyFile(role, pair.secretKey)) as KeyFileObject;
  } finally {
    pair.secretKey.fill(0); // the page keeps the stored form and the signer closures, not a loose copy
  }
}

/** Signers for stored key files. Throws CryptoError (never echoing a secret) when a file is not a valid key for its slot. */
export function keysFromFiles(files: KeyFiles): DemoKeys {
  const engine = parseKeyFile(files.engine, "engine");
  const delegator = parseKeyFile(files.delegator, "delegator");
  if (engine.did === delegator.did) throw new CryptoError("the engine key and the delegator key must be two different keys");
  return { engine, delegator, source: "ephemeral" };
}

/** New throwaway keys, with their stored form. */
export function newKeyMaterial(): KeyMaterial {
  const files: KeyFiles = { engine: freshFile("engine"), delegator: freshFile("delegator") };
  return { keys: keysFromFiles(files), files };
}
