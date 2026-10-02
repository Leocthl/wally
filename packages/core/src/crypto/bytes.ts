// Strict byte encoders. Every decoder rejects non-canonical input so a changed character can never
// decode to the same bytes (T-V1). Browser-safe: @noble/hashes utils and @scure/base only.
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { base58, base64urlnopad } from "@scure/base";
import { CryptoError, errorMessage } from "./errors";

/** Multibase prefix for base58btc (multibase table). */
export const MULTIBASE_BASE58BTC = "z";

const HEX_RE = /^(?:[0-9a-f]{2})*$/;
const B64U_RE = /^[A-Za-z0-9_-]*$/;

export function utf8(text: string): Uint8Array {
  return utf8ToBytes(text);
}

export function concat(...parts: readonly Uint8Array[]): Uint8Array {
  return concatBytes(...parts);
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Lowercase hex. */
export function toHex(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

/** Lowercase, even-length hex only. */
export function fromHex(hex: string): Uint8Array {
  if (!HEX_RE.test(hex)) throw new CryptoError("hex must be lowercase with an even length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** base64url without padding (RFC 4648 section 5). */
export function toBase64url(bytes: Uint8Array): string {
  return base64urlnopad.encode(bytes);
}

/**
 * base64url without padding; rejects padding, other alphabets and non-zero spare bits. Decoders may
 * ignore spare bits, so the result must re-encode to exactly the input (one spelling per value).
 */
export function fromBase64url(text: string): Uint8Array {
  if (!B64U_RE.test(text)) throw new CryptoError("base64url must use A-Z a-z 0-9 - _ without padding");
  let bytes: Uint8Array;
  try {
    bytes = base64urlnopad.decode(text);
  } catch (err) {
    throw new CryptoError(`invalid base64url: ${errorMessage(err)}`);
  }
  if (toBase64url(bytes) !== text) throw new CryptoError("base64url is not in canonical form");
  return bytes;
}

export function toBase58btc(bytes: Uint8Array): string {
  return base58.encode(bytes);
}

export function fromBase58btc(text: string): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = base58.decode(text);
  } catch (err) {
    throw new CryptoError(`invalid base58btc: ${errorMessage(err)}`);
  }
  if (toBase58btc(bytes) !== text) throw new CryptoError("base58btc is not in canonical form");
  return bytes;
}

/** Multibase base58btc: 'z' + base58btc(bytes). */
export function toMultibase58btc(bytes: Uint8Array): string {
  return MULTIBASE_BASE58BTC + toBase58btc(bytes);
}

/** Multibase base58btc only; an empty payload is rejected (we never encode one). */
export function fromMultibase58btc(text: string): Uint8Array {
  if (!text.startsWith(MULTIBASE_BASE58BTC) || text.length < 2) {
    throw new CryptoError("multibase value must be 'z' + base58btc");
  }
  return fromBase58btc(text.slice(MULTIBASE_BASE58BTC.length));
}
