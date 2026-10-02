// Throwaway demo key files under KEY_DIR (.keys/, gitignored, mode 600), written by `pnpm keys:gen`.
// The only place a secret key is serialised. Errors never echo key material (I8).
import type { Signer } from "../ports";
import { fromBase64url, toBase64url } from "./bytes";
import { didKeyFromPublicKey } from "./did-key";
import { ED25519_KEY_BYTES, keyPairFromSeed } from "./ed25519";
import { CryptoError } from "./errors";
import { createSigner } from "./signer";

export const KEY_FILE_KIND = "laisee.ed25519-secret-key.v1";
/** Roles that hold a secret key. The agent did:key is an identifier only; its secret is discarded (I4). */
export const KEY_ROLES = ["engine", "delegator"] as const;
export type KeyRole = (typeof KEY_ROLES)[number];

const KEY_FILE_FIELDS = ["did", "kind", "note", "role", "secret_key"];
const NOTE = "Throwaway demo key (rail SIMULATED). Never commit, log or print it (I8).";

/** JSON text of a key file for `role`. Used only by scripts/keys-gen.mjs. */
export function serializeKeyFile(role: KeyRole, secretKey: Uint8Array): string {
  const pair = keyPairFromSeed(secretKey);
  const file = {
    kind: KEY_FILE_KIND,
    role,
    did: didKeyFromPublicKey(pair.publicKey),
    secret_key: toBase64url(pair.secretKey),
    note: NOTE,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

function field(file: Record<string, unknown>, name: string): string {
  const value = file[name];
  if (typeof value !== "string") throw new CryptoError(`key file: ${name} must be a string`);
  return value;
}

function decodeSecret(encoded: string): Uint8Array {
  try {
    const bytes = fromBase64url(encoded);
    if (bytes.length === ED25519_KEY_BYTES) return bytes;
  } catch {
    // fall through to one error that does not repeat the encoded value
  }
  throw new CryptoError(`key file: secret_key must be ${ED25519_KEY_BYTES} bytes of base64url`);
}

/** Validates a parsed key file and returns a Signer; the did must match the secret key. */
export function parseKeyFile(value: unknown, expectedRole: KeyRole): Signer {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new CryptoError("key file: not an object");
  const file = value as Record<string, unknown>;
  if (Object.keys(file).sort().join() !== KEY_FILE_FIELDS.join()) {
    throw new CryptoError(`key file: fields must be ${KEY_FILE_FIELDS.join(", ")}`);
  }
  if (field(file, "kind") !== KEY_FILE_KIND) throw new CryptoError(`key file: kind must be ${KEY_FILE_KIND}`);
  if (field(file, "role") !== expectedRole) throw new CryptoError(`key file: role must be ${expectedRole}`);
  const signer = createSigner(decodeSecret(field(file, "secret_key")));
  if (signer.did !== field(file, "did")) throw new CryptoError("key file: did does not match the secret key");
  return signer;
}
