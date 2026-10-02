// Ed25519 (RFC 8032) on @noble/curves. Verification is strict RFC 8032 (zip215: false) and never throws.
import { ed25519 } from "@noble/curves/ed25519.js";
import { CryptoError } from "./errors";

/** RFC 8032 section 5.1.5: 32-byte secret seed and public key; 64-byte signature. */
export const ED25519_KEY_BYTES = 32;
export const ED25519_SIGNATURE_BYTES = 64;

export interface KeyPair {
  readonly secretKey: Uint8Array;
  readonly publicKey: Uint8Array;
}

function assertSecretKey(secretKey: Uint8Array): void {
  if (!(secretKey instanceof Uint8Array) || secretKey.length !== ED25519_KEY_BYTES) {
    throw new CryptoError(`Ed25519 secret key must be ${ED25519_KEY_BYTES} bytes`);
  }
}

/** Fresh random key pair (crypto.getRandomValues through noble). */
export function generateKeyPair(): KeyPair {
  const secretKey = ed25519.utils.randomSecretKey();
  return { secretKey, publicKey: ed25519.getPublicKey(secretKey) };
}

/** Deterministic key pair from a 32-byte seed (tests, golden vectors). The seed is copied. */
export function keyPairFromSeed(seed: Uint8Array): KeyPair {
  assertSecretKey(seed);
  const secretKey = Uint8Array.from(seed);
  return { secretKey, publicKey: ed25519.getPublicKey(secretKey) };
}

export function publicKeyFromSecret(secretKey: Uint8Array): Uint8Array {
  assertSecretKey(secretKey);
  return ed25519.getPublicKey(secretKey);
}

/** Raw signing. Not exported from @laisee/core/crypto: callers sign through a Signer. */
export function signEd25519(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  assertSecretKey(secretKey);
  return ed25519.sign(message, secretKey);
}

/** True only for a valid signature; malformed lengths or points give false (fail closed, I5). */
export function verifyEd25519(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  if (signature.length !== ED25519_SIGNATURE_BYTES || publicKey.length !== ED25519_KEY_BYTES) return false;
  try {
    return ed25519.verify(signature, message, publicKey, { zip215: false });
  } catch {
    return false; // noble throws on malformed points; that is a failed verification, not an error to surface
  }
}

/** Whether 32 bytes decode to a valid Ed25519 point (strict encoding). */
export function isValidPublicKey(publicKey: Uint8Array): boolean {
  if (publicKey.length !== ED25519_KEY_BYTES) return false;
  try {
    return ed25519.utils.isValidPublicKey(publicKey, false);
  } catch {
    return false; // malformed input is simply not a valid key
  }
}
