// did:key for Ed25519 (W3C did:key method): 'did:key:z' + base58btc(0xed 0x01 || 32-byte public key).
import { concat, fromMultibase58btc, toMultibase58btc } from "./bytes";
import { ED25519_KEY_BYTES, isValidPublicKey } from "./ed25519";
import { CryptoError } from "./errors";

export const DID_KEY_PREFIX = "did:key:";
/** Multicodec ed25519-pub (0xed) as an unsigned varint: 0xed 0x01. */
const ED25519_MULTICODEC = Uint8Array.of(0xed, 0x01);

export function didKeyFromPublicKey(publicKey: Uint8Array): string {
  if (!isValidPublicKey(publicKey)) throw new CryptoError("not a valid Ed25519 public key");
  return DID_KEY_PREFIX + toMultibase58btc(concat(ED25519_MULTICODEC, publicKey));
}

/** Public key bytes of an Ed25519 did:key, or null for anything else. Never throws. */
export function parseDidKey(did: string): Uint8Array | null {
  if (typeof did !== "string" || !did.startsWith(DID_KEY_PREFIX)) return null;
  let decoded: Uint8Array;
  try {
    decoded = fromMultibase58btc(did.slice(DID_KEY_PREFIX.length));
  } catch {
    return null; // not multibase base58btc
  }
  if (decoded.length !== ED25519_MULTICODEC.length + ED25519_KEY_BYTES) return null;
  if (decoded[0] !== ED25519_MULTICODEC[0] || decoded[1] !== ED25519_MULTICODEC[1]) return null;
  const publicKey = decoded.slice(ED25519_MULTICODEC.length);
  return isValidPublicKey(publicKey) ? publicKey : null;
}

export function publicKeyFromDidKey(did: string): Uint8Array {
  const key = parseDidKey(did);
  if (key === null) throw new CryptoError("not an Ed25519 did:key");
  return key;
}

/** did:key verification method id: '<did>#<multibase key>'. */
export function verificationMethodId(did: string): string {
  publicKeyFromDidKey(did);
  return `${did}#${did.slice(DID_KEY_PREFIX.length)}`;
}
