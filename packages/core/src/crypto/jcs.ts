// RFC 8785 JSON Canonicalization Scheme (JCS) via the reference `canonicalize` package, plus SHA-256.
import canonicalize from "canonicalize";
import { sha256 } from "@noble/hashes/sha2.js";
import { toHex, utf8 } from "./bytes";
import { CryptoError, errorMessage } from "./errors";

/** Canonical JSON text. Throws CryptoError for NaN, Infinity, lone surrogates, BigInt, cycles or undefined. */
export function jcs(value: unknown): string {
  let out: string | undefined;
  try {
    out = canonicalize(value);
  } catch (err) {
    throw new CryptoError(`cannot canonicalize: ${errorMessage(err)}`);
  }
  if (out === undefined) throw new CryptoError("cannot canonicalize: value has no JSON form");
  return out;
}

export function sha256Bytes(data: Uint8Array | string): Uint8Array {
  return sha256(typeof data === "string" ? utf8(data) : data);
}

/** Lowercase hex SHA-256 of bytes or of UTF-8 text. */
export function sha256Hex(data: Uint8Array | string): string {
  return toHex(sha256Bytes(data));
}

/** SHA-256(UTF-8(JCS(value))). */
export function jcsSha256(value: unknown): Uint8Array {
  return sha256Bytes(jcs(value));
}

/** hex SHA-256(UTF-8(JCS(value))): payload_hash, entry_hash and the delegator payload digests. */
export function jcsSha256Hex(value: unknown): string {
  return toHex(jcsSha256(value));
}
