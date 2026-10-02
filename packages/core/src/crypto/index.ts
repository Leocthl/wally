// @laisee/core/crypto: JCS, SHA-256, Ed25519, base58btc/multibase, did:key, Signer (docs/02 section 11).
// Browser-safe (no node: imports). Raw signing stays inside the Signer closure; it is not exported.
export { CryptoError } from "./errors";
export {
  bytesEqual,
  concat,
  fromBase58btc,
  fromBase64url,
  fromHex,
  fromMultibase58btc,
  MULTIBASE_BASE58BTC,
  toBase58btc,
  toBase64url,
  toHex,
  toMultibase58btc,
  utf8,
} from "./bytes";
export { jcs, jcsSha256, jcsSha256Hex, sha256Bytes, sha256Hex } from "./jcs";
export {
  ED25519_KEY_BYTES,
  ED25519_SIGNATURE_BYTES,
  generateKeyPair,
  isValidPublicKey,
  keyPairFromSeed,
  publicKeyFromSecret,
  verifyEd25519,
  type KeyPair,
} from "./ed25519";
export { DID_KEY_PREFIX, didKeyFromPublicKey, parseDidKey, publicKeyFromDidKey, verificationMethodId } from "./did-key";
export { createSigner } from "./signer";
export { KEY_FILE_KIND, KEY_ROLES, parseKeyFile, serializeKeyFile, type KeyRole } from "./key-file";
